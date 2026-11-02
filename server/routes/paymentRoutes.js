/**
 * Payment Routes
 *
 * Mounts the Razorpay webhook endpoint on /api/payment/webhook.
 *
 * IMPORTANT: The webhook route uses express.raw() instead of express.json()
 * so that the raw body buffer is preserved for HMAC signature verification.
 * This router must be mounted in server.js BEFORE the global express.json()
 * middleware (see server.js for the mount order).
 *
 * Route map:
 *   POST /api/payment/webhook  — public, raw body, Razorpay event handler
 */

const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook } = require('../controllers/webhookController');

// The webhook route receives raw bytes so the HMAC can be verified.
// express.raw() is applied per-route here rather than globally to avoid
// interfering with other JSON endpoints.
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
);

module.exports = router;
