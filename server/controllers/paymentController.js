
const { ObjectId } = require('mongodb');
const { randomUUID } = require('crypto');
const { getDB, getClient } = require('../config/db');
const dotenv = require('dotenv');
dotenv.config();

const {
  createGatewayOrder,
  getRazorpayInstance,
} = require('../services/razorpayService');
const {
  createHmac,
  timingSafeEqual,
} = require('crypto');


const validateShippingAddress = (address) => {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
        return null;
    }

    const fields = [
        'fullName',
        'phone',
        'addressLine1',
        'city',
        'state',
        'postalCode',
        'country',
    ];

    const normalized = {};

    for (const field of fields) {
        if (
            typeof address[field] !== 'string' ||
            !address[field].trim()
        ) {
            return null;
        }

        normalized[field] = address[field].trim();
    }

    if (!/^[0-9]{10}$/.test(normalized.phone)) {
        return null;
    }

    if (!/^[0-9]{6}$/.test(normalized.postalCode)) {
        return null;
    }

    if (normalized.country !== 'India') {
        return null;
    }

    return normalized;
};




const verifyRazorpaySignature = ({
  orderId,
  paymentId,
  signature,
}) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (
    !secret ||
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !orderId ||
    !paymentId ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest();

  const receivedSignature = Buffer.from(signature, 'hex');

  if (receivedSignature.length !== expectedSignature.length) {
    return false;
  }

  return timingSafeEqual(expectedSignature, receivedSignature);
};




const createRazorpayOrder = async (req, res) => {
    console.log('[RAZORPAY] createRazorpayOrder reached');
  const userId = req.user?.id;

  if (!userId || !ObjectId.isValid(userId.toString())) {
    return res.status(401).json({
      success: false,
      message: 'Invalid user identity',
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
      message: 'A valid Idempotency-Key header is required',
    });
  }

  const shippingAddress = validateShippingAddress(
    req.body?.shippingAddress
  );

  if (!shippingAddress) {
    return res.status(400).json({
      success: false,
      message: 'A valid shipping address is required',
    });
  }

  const db = getDB();
  const client = getClient();

  const orders = db.collection('orders');
  const carts = db.collection('carts');
  const products = db.collection('products');

  const customerId = new ObjectId(userId.toString());
  let reservedOrder = null;

  try {
    // Return an existing order for a retried request.
    const existingOrder = await orders.findOne({
      userId: customerId,
      idempotencyKey,
    });

    
if (existingOrder) {
    console.log('[RAZORPAY] Terminal order matched:', {
    requestKey: idempotencyKey,
    existingKey: existingOrder.idempotencyKey,
    orderId: existingOrder.orderId,
    paymentStatus: existingOrder.paymentStatus,
    orderStatus: existingOrder.orderStatus,
});
    if (existingOrder.paymentMethod !== 'razorpay') {
        return res.status(409).json({
            success: false,
            message: 'This checkout key belongs to another payment method.',
        });
    }

    // A failed or cancelled order must not be treated as an active checkout.
    if (
        existingOrder.paymentStatus !== 'pending' ||
        existingOrder.orderStatus !== 'pending_payment'
    ) {
        return res.status(409).json({
            success: false,
            code: 'CHECKOUT_ATTEMPT_TERMINAL',
            message: 'Your previous checkout attempt is no longer active. Please try again.',
        });
    }

    // A genuinely pending order without a gateway ID may still be processing.
    if (!existingOrder.razorpayOrderId) {
        return res.status(409).json({
            success: false,
            message: 'This checkout request is already being processed.',
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Payment order already created',
        order: {
            orderId: existingOrder.orderId,
            razorpayOrderId: existingOrder.razorpayOrderId,
            amount: Math.round(existingOrder.totalAmount * 100),
            currency: existingOrder.currency,
            paymentStatus: existingOrder.paymentStatus,
        },
        keyId: process.env.RAZORPAY_KEY_ID?.trim(),
    });
}


    // Prevent a second simultaneous pending checkout for this user.
    const pendingOrder = await orders.findOne({
      userId: customerId,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      orderStatus: 'pending_payment',
    });

    if (pendingOrder) {
      return res.status(409).json({
        success: false,
        message:
          'You already have a pending payment. Complete or resolve it before starting another checkout.',
      });
    }

    const orderId = randomUUID();
    const now = new Date();
    const session = client.startSession();

    let createdOrder;
    let totalPaise;

    try {
      await session.withTransaction(async () => {
        const cart = await carts.findOne(
          { userId: customerId },
          { session }
        );

        if (
          !cart ||
          !Array.isArray(cart.items) ||
          cart.items.length === 0
        ) {
          const error = new Error('Your cart is empty.');
          error.statusCode = 400;
          throw error;
        }

        const quantities = new Map();

        for (const item of cart.items) {
          if (
            !(item.productId instanceof ObjectId) ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > 100
          ) {
            const error = new Error(
              'Your cart contains invalid items.'
            );
            error.statusCode = 400;
            throw error;
          }

          const productId = item.productId.toString();

          quantities.set(
            productId,
            (quantities.get(productId) || 0) + item.quantity
          );
        }

        const productIds = [...quantities.keys()].map(
          id => new ObjectId(id)
        );

        const productDocuments = await products
          .find(
            { _id: { $in: productIds } },
            { session }
          )
          .toArray();

        const productMap = new Map(
          productDocuments.map(product => [
            product._id.toString(),
            product,
          ])
        );

        if (productMap.size !== productIds.length) {
          const error = new Error(
            'One or more products are no longer available.'
          );
          error.statusCode = 409;
          throw error;
        }

        const orderItems = [];
        totalPaise = 0;

        for (const [productId, quantity] of quantities) {
          const product = productMap.get(productId);

          if (
            typeof product.price !== 'number' ||
            !Number.isFinite(product.price) ||
            product.price <= 0 ||
            !Number.isSafeInteger(product.stock) ||
            product.stock < quantity
          ) {
            const error = new Error(
              `Insufficient stock or invalid pricing for ${product.name || productId}.`
            );
            error.statusCode = 409;
            throw error;
          }

          const unitPricePaise = Math.round(product.price * 100);
          const subtotalPaise = unitPricePaise * quantity;

          if (!Number.isSafeInteger(subtotalPaise)) {
            const error = new Error('Order amount is too large.');
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
            subtotal: subtotalPaise / 100,
          });
        }

        if (
          !Number.isSafeInteger(totalPaise) ||
          totalPaise <= 0
        ) {
          const error = new Error('Order total is invalid.');
          error.statusCode = 400;
          throw error;
        }

        // Reserve inventory atomically.
        for (const [productId, quantity] of quantities) {
          const result = await products.updateOne(
            {
              _id: new ObjectId(productId),
              stock: { $gte: quantity },
            },
            {
              $inc: { stock: -quantity },
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
          shippingAddress,
          paymentMethod: 'razorpay',
          paymentStatus: 'pending',
          orderStatus: 'pending_payment',
          createdAt: now,
          updatedAt: now,
        };

        await orders.insertOne(createdOrder, { session });
      });
    } finally {
      await session.endSession();
    }

    reservedOrder = {
      orderId,
      customerId,
      items: createdOrder.items,
    };

    // The gateway call happens after the database transaction commits.
    const gatewayOrder = await createGatewayOrder({
      amountPaise: totalPaise,
      receipt: orderId,
      notes: {
        shopmateOrderId: orderId,
        customerId: customerId.toString(),
      },
    });

    await orders.updateOne(
      {
        orderId,
        userId: customerId,
        paymentStatus: 'pending',
      },
      {
        $set: {
          razorpayOrderId: gatewayOrder.id,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Payment order created',
      order: {
        orderId,
        razorpayOrderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        paymentStatus: 'pending',
      },
      keyId: process.env.RAZORPAY_KEY_ID?.trim(),
    });
  } catch (error) {
    if (reservedOrder) {
      try {
        const recoverySession = client.startSession();

        try {
          await recoverySession.withTransaction(async () => {
            const pendingOrder = await orders.findOne(
              {
                orderId: reservedOrder.orderId,
                userId: reservedOrder.customerId,
                paymentStatus: 'pending',
                orderStatus: 'pending_payment',
                razorpayOrderId: { $exists: false },
              },
              { session: recoverySession }
            );

            // Recover stock only if this order is still eligible.
            if (!pendingOrder) return;

            for (const item of reservedOrder.items) {
              const result = await products.updateOne(
                { _id: item.productId },
                { $inc: { stock: item.quantity } },
                { session: recoverySession }
              );

              if (result.modifiedCount !== 1) {
                throw new Error(
                  `Could not restore stock for product ${item.productId}`
                );
              }
            }

            await orders.updateOne(
              {
                _id: pendingOrder._id,
                paymentStatus: 'pending',
                orderStatus: 'pending_payment',
              },
              {
                $set: {
                  paymentStatus: 'failed',
                  orderStatus: 'cancelled',
                  updatedAt: new Date(),
                },
              },
              { session: recoverySession }
            );
          });
        } finally {
          await recoverySession.endSession();
        }
      } catch (recoveryError) {
        console.error(
          'Payment failure inventory recovery error:',
          recoveryError
        );
      }
    }

    // Upstream gateway errors (from Razorpay SDK, network, or credentials) must not be treated as user session failures
    if (
      error.isGatewayError ||
      reservedOrder ||
      error.code === 'GATEWAY_CREDENTIALS_MISSING' ||
      error.code === 'GATEWAY_CONFIGURATION_ERROR'
    ) {
      const isAuthError =
        error.gatewayCategory === 'AUTHENTICATION_ERROR' ||
        error.statusCode === 401 ||
        error.error?.description?.toLowerCase()?.includes('authentication');
      const isConfigError =
        error.code === 'GATEWAY_CREDENTIALS_MISSING' ||
        error.code === 'GATEWAY_CONFIGURATION_ERROR';
      const isNetworkError =
        error.gatewayCategory === 'NETWORK_ERROR' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND';
      const isValidationError =
        error.gatewayCategory === 'VALIDATION_ERROR' ||
        error.statusCode === 400;

      let gatewayCategory = 'UPSTREAM_ERROR';
      let userMessage = 'Unable to initialize payment. Please try again later.';

      if (isAuthError) {
        gatewayCategory = 'AUTHENTICATION_ERROR';
        userMessage =
          'Payment gateway authentication failed. Please verify merchant API credentials or try again later.';
      } else if (isConfigError) {
        gatewayCategory = 'CONFIGURATION_ERROR';
        userMessage =
          'Payment gateway is not properly configured. Please contact support.';
      } else if (isNetworkError) {
        gatewayCategory = 'NETWORK_ERROR';
        userMessage =
          'Payment gateway connection timed out or is unavailable. Please try again.';
      } else if (isValidationError) {
        gatewayCategory = 'VALIDATION_ERROR';
        userMessage =
          'Payment gateway rejected the order parameters. Please try again.';
      }

      console.error('[RAZORPAY] Gateway order creation failed:', {
        orderId: reservedOrder?.orderId,
        gatewayCategory,
        statusCode: error.statusCode,
        gatewayCode: error.error?.code,
        gatewayDescription: error.error?.description,
        message: error.message,
      });

      return res.status(502).json({
        success: false,
        code: 'GATEWAY_ERROR',
        gatewayCategory,
        message: userMessage,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          'A checkout request with this key already exists. Check your order status before retrying.',
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message || 'Validation error',
      });
    }

    console.error('Create Razorpay order unexpected error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to create payment order.',
    });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  const userId = req.user?.id;

  if (!userId || !ObjectId.isValid(userId.toString())) {
    return res.status(401).json({
      success: false,
      message: 'Invalid user identity',
    });
  }

  const {
    orderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = req.body || {};

  if (
    typeof orderId !== 'string' ||
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof razorpaySignature !== 'string'
  ) {
    return res.status(400).json({
      success: false,
      message: 'Required payment verification details are missing.',
    });
  }

  const customerId = new ObjectId(userId.toString());
  const orders = getDB().collection('orders');

  try {
    const order = await orders.findOne({
      orderId,
      userId: customerId,
      paymentMethod: 'razorpay',
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Payment order not found.',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Payment is already verified.',
        order: {
          orderId: order.orderId,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
        },
      });
    }

    if (
      order.paymentStatus !== 'pending' ||
      order.orderStatus !== 'pending_payment' ||
      order.razorpayOrderId !== razorpayOrderId
    ) {
      return res.status(409).json({
        success: false,
        message: 'Order is not eligible for payment verification.',
      });
    }

    const signatureIsValid = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!signatureIsValid) {
      return res.status(400).json({
        success: false,
        message: 'Payment signature verification failed.',
      });
    }

    // Signature verification alone does not prove that the payment
    // has been captured or that its amount matches the local order.
    // Gateway status and amount verification will be added next.

        // Fetch the payment from Razorpay's server-side API.
    const razorpay = getRazorpayInstance();

    const payment = await razorpay.payments.fetch(
      razorpayPaymentId
    );

    // Confirm that this payment belongs to the expected gateway order.
    if (payment.order_id !== order.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment does not belong to this order.',
      });
    }

    // Verify the amount and currency against ShopMate's database.
    const expectedAmount = Math.round(order.totalAmount * 100);

    if (
      payment.amount !== expectedAmount ||
      payment.currency !== order.currency
    ) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount or currency does not match the order.',
      });
    }

    // An authorized payment is not necessarily a captured payment.
    if (payment.status !== 'captured' || payment.captured !== true) {
      return res.status(409).json({
        success: false,
        message:
          'Payment has not been captured yet. Please check the payment status again.',
      });
    }

    // Only transition an order that is still awaiting payment.
        const db = getDB();
    const client = getClient();
    const carts = db.collection('carts');
    const session = client.startSession();

    let paymentConfirmed = false;

    try {
      await session.withTransaction(async () => {
        // Recheck the order inside the transaction to prevent
        // concurrent verification requests from confirming it twice.
        const currentOrder = await orders.findOne(
          {
            _id: order._id,
            userId: customerId,
            paymentMethod: 'razorpay',
            razorpayOrderId,
            paymentStatus: 'pending',
            orderStatus: 'pending_payment',
          },
          { session }
        );

        if (!currentOrder) {
          const existingPaidOrder = await orders.findOne(
            {
              _id: order._id,
              userId: customerId,
              paymentStatus: 'paid',
              razorpayPaymentId,
            },
            { session }
          );

          if (existingPaidOrder) {
            paymentConfirmed = true;
            return;
          }

          const error = new Error(
            'Order status changed. Please refresh your order history.'
          );
          error.statusCode = 409;
          throw error;
        }

        // Remove only the purchased quantities. Do not clear newer
        // cart changes that the customer made during checkout.
        const cart = await carts.findOne(
          { userId: customerId },
          { session }
        );

        if (cart && Array.isArray(cart.items)) {
          const remainingItems = [...cart.items];

          for (const purchasedItem of currentOrder.items) {
            let remainingQuantity = purchasedItem.quantity;

            for (let index = 0; index < remainingItems.length; index++) {
              const cartItem = remainingItems[index];

              if (
                cartItem.productId?.toString() !==
                purchasedItem.productId.toString()
              ) {
                continue;
              }

              const quantityToRemove = Math.min(
                remainingQuantity,
                cartItem.quantity
              );

              remainingQuantity -= quantityToRemove;
              cartItem.quantity -= quantityToRemove;

              if (cartItem.quantity === 0) {
                remainingItems.splice(index, 1);
                index--;
              }

              if (remainingQuantity === 0) break;
            }
          }

          await carts.updateOne(
            { _id: cart._id },
            {
              $set: {
                items: remainingItems,
                updatedAt: new Date(),
              },
            },
            { session }
          );
        }

        const result = await orders.updateOne(
          {
            _id: currentOrder._id,
            paymentStatus: 'pending',
            orderStatus: 'pending_payment',
          },
          {
            $set: {
              paymentStatus: 'paid',
              orderStatus: 'placed',
              razorpayPaymentId,
              paidAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session }
        );

        if (result.modifiedCount !== 1) {
          const error = new Error(
            'Unable to update the order payment status.'
          );
          error.statusCode = 409;
          throw error;
        }

        paymentConfirmed = true;
      });

    } finally {
      await session.endSession();
    }

    if (!paymentConfirmed) {
      return res.status(409).json({
        success: false,
        message: 'Payment confirmation could not be completed.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully.',
      order: {
        orderId: order.orderId,
        paymentStatus: 'paid',
        orderStatus: 'placed',
      },
    });
  } catch (error) {
    console.error('Verify Razorpay payment error:', {
      message: error.message,
      statusCode: error.statusCode,
      gatewayDetails: error.error || null,
    });

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to verify payment.',
    });
  }
};



module.exports = { 
    createRazorpayOrder,
     validateShippingAddress ,
     verifyRazorpaySignature,
        verifyRazorpayPayment
    };
