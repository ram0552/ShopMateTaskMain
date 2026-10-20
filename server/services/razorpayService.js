
const Razorpay = require('razorpay');

const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured');
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

  return razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes,
  });
};

module.exports = {
  getRazorpayInstance,
  createGatewayOrder,
};
