
const { ObjectId } = require('mongodb');
const { randomUUID } = require('crypto');
const { getDB, getClient } = require('../config/db');


const createOrder = async (req, res) => {
  const userId = req.user?.id;

  if (!userId || !ObjectId.isValid(userId.toString())) {
    return res.status(401).json({
      success: false,
      message: 'Invalid user identity'
    });
  }

  const idempotencyKey = req.get('Idempotency-Key');

  if (
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128
  ) {
    return res.status(400).json({
      success: false,
      message: 'A valid Idempotency-Key header is required'
    });
  }

  const { shippingAddress, paymentMethod } = req.body;

  if (paymentMethod !== 'cod') {
    return res.status(400).json({
      success: false,
      message: 'Only Cash on Delivery is supported in this step'
    });
  }

  const requiredAddressFields = [
    'fullName',
    'phone',
    'addressLine1',
    'city',
    'state',
    'postalCode',
    'country'
  ];

  if (
    !shippingAddress ||
    typeof shippingAddress !== 'object' ||
    Array.isArray(shippingAddress) ||
    requiredAddressFields.some(
      field =>
        typeof shippingAddress[field] !== 'string' ||
        !shippingAddress[field].trim()
    )
  ) {
    return res.status(400).json({
      success: false,
      message: 'A complete shipping address is required'
    });
  }

  const normalizedAddress = Object.fromEntries(
    requiredAddressFields.map(field => [
      field,
      shippingAddress[field].trim()
    ])
  );

  const db = getDB();
  const client = getClient();
  const orders = db.collection('orders');
  const carts = db.collection('carts');
  const products = db.collection('products');
  const customerId = new ObjectId(userId.toString());

  // A retry with the same key must not create another order.
  const existingOrder = await orders.findOne({
    userId: customerId,
    idempotencyKey
  });
console.log('Razorpay idempotency check:', {
    idempotencyKey,
    existingOrderId: existingOrder?.orderId ?? null,
    existingPaymentStatus: existingOrder?.paymentStatus ?? null,
    existingOrderStatus: existingOrder?.orderStatus ?? null,
    existingRazorpayOrderId: existingOrder?.razorpayOrderId ?? null,
});

  if (existingOrder) {
    return res.status(200).json({
      success: true,
      message: 'Order already created',
      order: {
        orderId: existingOrder.orderId,
        status: existingOrder.orderStatus,
        paymentStatus: existingOrder.paymentStatus,
        totalAmount: existingOrder.totalAmount
      }
    });
  }

  const session = client.startSession();
  const orderId = randomUUID();
  const now = new Date();

  let createdOrder;

  try {
    await session.withTransaction(async () => {
      const cart = await carts.findOne(
        { userId: customerId },
        { session }
      );

      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        const error = new Error('Your cart is empty');
        error.statusCode = 400;
        throw error;
      }

      // Consolidate duplicate product IDs defensively.
      const quantities = new Map();

      for (const item of cart.items) {
        if (
          !(item.productId instanceof ObjectId) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 100
        ) {
          const error = new Error('Cart contains invalid items');
          error.statusCode = 400;
          throw error;
        }

        const id = item.productId.toString();
        quantities.set(id, (quantities.get(id) || 0) + item.quantity);
      }

      const productIds = [...quantities.keys()].map(
        id => new ObjectId(id)
      );

      const productDocuments = await products.find(
        { _id: { $in: productIds } },
        { session }
      ).toArray();

      const productMap = new Map(
        productDocuments.map(product => [
          product._id.toString(),
          product
        ])
      );

      if (productMap.size !== productIds.length) {
        const error = new Error(
          'One or more products are no longer available'
        );
        error.statusCode = 409;
        throw error;
      }

      const orderItems = [];
      let totalPaise = 0;

      for (const [productId, quantity] of quantities) {
        const product = productMap.get(productId);

        if (
          typeof product.price !== 'number' ||
          !Number.isFinite(product.price) ||
          product.price < 0 ||
          !Number.isSafeInteger(product.stock) ||
          product.stock < 0
        ) {
          const error = new Error(
            `Product ${product.name || productId} has invalid pricing or stock`
          );
          error.statusCode = 409;
          throw error;
        }

        if (product.stock < quantity) {
          const error = new Error(
            `Insufficient stock for ${product.name}`
          );
          error.statusCode = 409;
          throw error;
        }

        const unitPricePaise = Math.round(product.price * 100);
        const subtotalPaise = unitPricePaise * quantity;

        if (!Number.isSafeInteger(subtotalPaise)) {
          const error = new Error('Order amount is too large');
          error.statusCode = 400;
          throw error;
        }

        totalPaise += subtotalPaise;

        orderItems.push({
          productId: product._id,
          name: product.name,
          image: product.image || '',
          unitPrice: unitPricePaise / 100,
          quantity,
          subtotal: subtotalPaise / 100
        });
      }

      if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
        const error = new Error('Order total is invalid');
        error.statusCode = 400;
        throw error;
      }

      // Conditional updates prevent overselling.
      for (const [productId, quantity] of quantities) {
        const result = await products.updateOne(
          {
            _id: new ObjectId(productId),
            stock: { $gte: quantity }
          },
          {
            $inc: { stock: -quantity }
          },
          { session }
        );

        if (result.modifiedCount !== 1) {
          const error = new Error(
            'Stock changed during checkout. Please retry.'
          );
          error.statusCode = 409;
          throw error;
        }
      }

      createdOrder = {
        orderId,
        userId: customerId,
        idempotencyKey,
        items: orderItems,
        totalAmount: totalPaise / 100,
        currency: 'INR',
        shippingAddress: normalizedAddress,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        orderStatus: 'placed',
        createdAt: now,
        updatedAt: now
      };

      await orders.insertOne(createdOrder, { session });

      await carts.updateOne(
        { userId: customerId },
        {
          $set: {
            items: [],
            updatedAt: now
          }
        },
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: {
        orderId: createdOrder.orderId,
        status: createdOrder.orderStatus,
        paymentStatus: createdOrder.paymentStatus,
        paymentMethod: createdOrder.paymentMethod,
        totalAmount: createdOrder.totalAmount,
        currency: createdOrder.currency,
        items: createdOrder.items,
        createdAt: createdOrder.createdAt
      }
    });
  } catch (error) {
    // Concurrent retries using the same key may hit the unique index.
    if (error.code === 11000) {
      const existing = await orders.findOne({
        userId: customerId,
        idempotencyKey
      });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Order already created',
          order: {
            orderId: existing.orderId,
            status: existing.orderStatus,
            paymentStatus: existing.paymentStatus,
            totalAmount: existing.totalAmount
          }
        });
      }
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    console.error('Create order error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to place order'
    });
  } finally {
    await session.endSession();
  }
};


const getAuthenticatedUserId = (req) => {
  const userId = req.user?.id;

  if (!userId || !ObjectId.isValid(userId)) {
    const error = new Error('Invalid authenticated user');
    error.statusCode = 401;
    throw error;
  }

  return new ObjectId(userId);
};

// GET /api/orders
const getMyOrders = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const db = getDB();

    const page = Number.parseInt(req.query.page ?? '1', 10);
    const limit = Number.parseInt(req.query.limit ?? '10', 10);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: 'Page must be positive and limit must be between 1 and 50.',
      });
    }

    const ordersCollection = db.collection('orders');
    const filter = { userId };

    const [orders, total] = await Promise.all([
      ordersCollection
        .find(filter, {
          projection: { _id: 0, idempotencyKey: 0 },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),

      ordersCollection.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 401
          ? error.message
          : 'Failed to retrieve orders.',
    });
  }
};

// GET /api/orders/:orderId
const getOrderById = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { orderId } = req.params;

    if (
      typeof orderId !== 'string' ||
      orderId.length > 100 ||
      !/^[0-9a-f-]{36}$/i.test(orderId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID.',
      });
    }

    const order = await getDB()
      .collection('orders')
      .findOne(
        { orderId, userId },
        { projection: { _id: 0, idempotencyKey: 0 } }
      );

    // Use the same response for missing orders and orders owned by
    // someone else, so order existence is not disclosed.
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Get order details error:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 401
          ? error.message
          : 'Failed to retrieve order details.',
    });
  }
};

const cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user?.id;

  if (
    typeof orderId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(orderId)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid order ID.',
    });
  }

  if (!userId || !ObjectId.isValid(userId)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid authenticated user.',
    });
  }

  const customerId = new ObjectId(userId);
  const client = getClient();
  const session = client.startSession();

  try {
    let resultOrder = null;

    await session.withTransaction(async () => {
      const db = getDB();
      const orders = db.collection('orders');
      const products = db.collection('products');

      const order = await orders.findOne(
        { orderId, userId: customerId },
        { session }
      );

      if (!order) {
        const error = new Error('Order not found.');
        error.statusCode = 404;
        throw error;
      }

      // Idempotent cancellation: never restore stock twice.
      if (order.orderStatus === 'cancelled') {
        resultOrder = order;
        return;
      }

      if (order.orderStatus !== 'placed') {
        const error = new Error(
          'Only orders with status "placed" can be cancelled.'
        );
        error.statusCode = 409;
        throw error;
      }

      if (!Array.isArray(order.items) || order.items.length === 0) {
        const error = new Error(
          'Order items are invalid; cancellation was not completed.'
        );
        error.statusCode = 409;
        throw error;
      }

      // Validate the complete order before changing inventory.
      const quantities = new Map();

      for (const item of order.items) {
        const rawProductId = item.productId;
        const productId =
          rawProductId instanceof ObjectId
            ? rawProductId
            : typeof rawProductId === 'string' &&
                ObjectId.isValid(rawProductId)
              ? new ObjectId(rawProductId)
              : null;

        if (
          !productId ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1
        ) {
          const error = new Error(
            'Order items are invalid; cancellation was not completed.'
          );
          error.statusCode = 409;
          throw error;
        }

        const key = productId.toHexString();
        quantities.set(
          key,
          (quantities.get(key) || 0) + item.quantity
        );
      }

      // Restore stock inside the same transaction.
      for (const [productId, quantity] of quantities) {
        const result = await products.updateOne(
          { _id: new ObjectId(productId) },
          { $inc: { stock: quantity } },
          { session }
        );

        if (result.matchedCount !== 1) {
          const error = new Error(
            'A product could not be found; cancellation was rolled back.'
          );
          error.statusCode = 409;
          throw error;
        }
      }

      const now = new Date();

      const updateResult = await orders.updateOne(
        {
          orderId,
          userId: customerId,
          orderStatus: 'placed',
        },
        {
          $set: {
            orderStatus: 'cancelled',
            cancelledAt: now,
            updatedAt: now,
          },
        },
        { session }
      );

      if (updateResult.modifiedCount !== 1) {
        const error = new Error(
          'Order status changed; retry the request.'
        );
        error.statusCode = 409;
        throw error;
      }

      resultOrder = {
        ...order,
        orderStatus: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
      };
    });

    return res.status(200).json({
      success: true,
      message:
        resultOrder?.orderStatus === 'cancelled'
          ? 'Order is cancelled.'
          : 'Order cancelled successfully.',
      data: resultOrder,
    });
  } catch (error) {
    console.error('Cancel order error:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : 'Failed to cancel order.',
    });
  } finally {
    await session.endSession();
  }
};


module.exports = { 
    createOrder ,
    getMyOrders,
    getOrderById,
    cancelOrder
};
