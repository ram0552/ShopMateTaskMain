/**
 * Razorpay Webhook Controller
 *
 * POST /api/payment/webhook  — public route, no auth middleware.
 *
 * Safety net: if a user pays inside the Razorpay modal but closes the tab
 * before the browser calls /verify, Razorpay pushes a server-to-server
 * event here, which reconciles the order automatically.
 *
 * Security: every request is validated against the HMAC-SHA256 signature
 * in the x-razorpay-signature header using a constant-time comparison.
 *
 * Idempotency: each event is processed at most once. If the order is
 * already in the target state the handler returns 200 immediately.
 *
 * Raw body requirement: this route MUST be mounted BEFORE express.json()
 * using express.raw({ type: 'application/json' }).
 */

const crypto = require('crypto');
const { getDB } = require('../config/db');

/**
 * Verify the Razorpay webhook signature.
 *
 * @param {Buffer} rawBody - Raw request body buffer.
 * @param {string} signature - Value of x-razorpay-signature header.
 * @param {string} secret - RAZORPAY_WEBHOOK_SECRET env var.
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== 'string' ||
    !signature ||
    typeof secret !== 'string' ||
    !secret
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use constant-time comparison on hex strings (same length by construction).
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
};

/**
 * Mark an order as paid.
 * Uses a conditional atomic update so concurrent calls are idempotent.
 *
 * @param {object} db - MongoDB database handle.
 * @param {string} razorpayOrderId - Gateway order ID (order_xxx).
 * @param {string} razorpayPaymentId - Gateway payment ID (pay_xxx).
 */
const markOrderPaid = async (db, razorpayOrderId, razorpayPaymentId) => {
  const orders = db.collection('orders');
  const carts = db.collection('carts');

  const order = await orders.findOne({ razorpayOrderId });

  if (!order) {
    console.warn('[WEBHOOK] Order not found for razorpayOrderId:', razorpayOrderId);
    return;
  }

  // Idempotency: already paid — nothing to do.
  if (order.paymentStatus === 'paid') {
    console.log('[WEBHOOK] Order already paid, skipping:', order.orderId);
    return;
  }

  if (
    order.paymentStatus !== 'pending' ||
    order.orderStatus !== 'pending_payment'
  ) {
    console.warn('[WEBHOOK] Order not in a payable state, skipping:', {
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
    });
    return;
  }

  const now = new Date();

  const result = await orders.updateOne(
    {
      _id: order._id,
      paymentStatus: 'pending',
      orderStatus: 'pending_payment',
    },
    {
      $set: {
        paymentStatus: 'paid',
        orderStatus: 'placed',
        razorpayPaymentId,
        paidAt: now,
        updatedAt: now,
        confirmedByWebhook: true,
      },
    }
  );

  if (result.modifiedCount !== 1) {
    // Another concurrent write (e.g. the verify endpoint) already updated it.
    console.log('[WEBHOOK] Skipped — concurrent modification detected:', order.orderId);
    return;
  }

  console.log('[WEBHOOK] Order marked paid:', order.orderId);

  // Clear purchased cart items (best-effort; failure is non-fatal).
  try {
    if (Array.isArray(order.items) && order.items.length > 0) {
      const cart = await carts.findOne({ userId: order.userId });

      if (cart && Array.isArray(cart.items)) {
        const remaining = [...cart.items];

        for (const purchased of order.items) {
          let qty = purchased.quantity;

          for (let i = 0; i < remaining.length; i++) {
            const ci = remaining[i];
            if (ci.productId?.toString() !== purchased.productId?.toString()) continue;

            const remove = Math.min(qty, ci.quantity);
            qty -= remove;
            ci.quantity -= remove;

            if (ci.quantity === 0) {
              remaining.splice(i, 1);
              i--;
            }
            if (qty === 0) break;
          }
        }

        await carts.updateOne(
          { _id: cart._id },
          { $set: { items: remaining, updatedAt: now } }
        );
      }
    }
  } catch (cartErr) {
    console.error('[WEBHOOK] Cart cleanup failed (non-fatal):', cartErr.message);
  }
};

/**
 * Mark an order as failed.
 *
 * @param {object} db - MongoDB database handle.
 * @param {string} razorpayOrderId - Gateway order ID.
 */
const markOrderFailed = async (db, razorpayOrderId) => {
  const orders = db.collection('orders');

  const order = await orders.findOne({ razorpayOrderId });

  if (!order) {
    console.warn('[WEBHOOK] Order not found for failure event:', razorpayOrderId);
    return;
  }

  if (order.paymentStatus !== 'pending') {
    console.log('[WEBHOOK] Order not in pending state for failure, skipping:', order.orderId);
    return;
  }

  const now = new Date();

  await orders.updateOne(
    { _id: order._id, paymentStatus: 'pending' },
    {
      $set: {
        paymentStatus: 'failed',
        orderStatus: 'cancelled',
        updatedAt: now,
      },
    }
  );

  console.log('[WEBHOOK] Order marked failed:', order.orderId);
};

/**
 * Express route handler for POST /api/payment/webhook.
 *
 * MUST be mounted before express.json() with:
 *   app.use('/api/payment/webhook', express.raw({ type: 'application/json' }), webhookRouter);
 */
const handleRazorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured.');
    // Return 200 so Razorpay does not retry indefinitely, but log prominently.
    return res
      .status(200)
      .json({ received: true, warning: 'Webhook secret not configured — events are not processed' });
  }

  const signature = req.headers['x-razorpay-signature'];

  if (!verifyWebhookSignature(req.body, signature, secret)) {
    console.warn('[WEBHOOK] Signature verification failed — possible spoofed request.');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (parseErr) {
    console.error('[WEBHOOK] Failed to parse body:', parseErr.message);
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }

  const eventType = event?.event;
  const paymentEntity = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;

  console.log('[WEBHOOK] Event received:', eventType);

  try {
    const db = getDB();

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;

      if (!razorpayOrderId) {
        console.warn('[WEBHOOK] Missing order ID in event payload:', eventType);
        return res.status(200).json({ received: true });
      }

      await markOrderPaid(db, razorpayOrderId, razorpayPaymentId || '');
    } else if (eventType === 'payment.failed') {
      const razorpayOrderId = paymentEntity?.order_id;

      if (!razorpayOrderId) {
        console.warn('[WEBHOOK] Missing order ID in payment.failed payload');
        return res.status(200).json({ received: true });
      }

      await markOrderFailed(db, razorpayOrderId);
    } else {
      console.log('[WEBHOOK] Unhandled event type (ignored):', eventType);
    }
  } catch (handlerErr) {
    // Log, but still return 200 — Razorpay retries on non-2xx for up to 24 h.
    console.error('[WEBHOOK] Handler error:', handlerErr.message);
  }

  return res.status(200).json({ received: true });
};

module.exports = { handleRazorpayWebhook };
