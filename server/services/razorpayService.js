const path = require('path');
const dotenv = require('dotenv');
// Ensure we load the .env file relative to this service file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const Razorpay = require('razorpay'); 

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    const error = new Error('Razorpay credentials are not configured');
    error.statusCode = 500;
    error.code = 'GATEWAY_CREDENTIALS_MISSING';
    error.isGatewayError = true;
    throw error;
  }

  if (!keyId.startsWith('rzp_test_') && !keyId.startsWith('rzp_live_')) {
    const error = new Error('Razorpay Key ID must start with rzp_test_ or rzp_live_');
    error.statusCode = 500;
    error.code = 'GATEWAY_CONFIGURATION_ERROR';
    error.isGatewayError = true;
    throw error;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

const createGatewayOrder = async ({
  amountPaise,
  receipt,
  notes = {},
}) => {
  if (
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    throw new Error('Payment amount must be a positive integer in paise');
  }

  if (
    typeof receipt !== 'string' ||
    receipt.trim().length === 0 ||
    receipt.length > 40
  ) {
    throw new Error('A valid payment receipt is required');
  }

  const razorpay = getRazorpayInstance();

  try {
    return await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes,
    });
  } catch (err) {
    err.isGatewayError = true;

    if (err.statusCode === 401 || err.error?.description?.toLowerCase()?.includes('authentication')) {
      err.gatewayCategory = 'AUTHENTICATION_ERROR';
    } else if (err.statusCode === 400) {
      err.gatewayCategory = 'VALIDATION_ERROR';
    } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      err.gatewayCategory = 'NETWORK_ERROR';
    } else if (err.statusCode === 429) {
      err.gatewayCategory = 'RATE_LIMIT_ERROR';
    } else {
      err.gatewayCategory = 'UPSTREAM_ERROR';
    }

    throw err;
  }
};

module.exports = {
  getRazorpayInstance,
  createGatewayOrder,
};
