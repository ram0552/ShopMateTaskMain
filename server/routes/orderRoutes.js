const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/authenticate');

const {
    createOrder,
    getMyOrders,
    getOrderById,  
    cancelOrder
    } = require('../controllers/orderController');

const {
  createRazorpayOrder,
    verifyRazorpayPayment
} = require('../controllers/paymentController');

router.use(authenticate);

router.post('/', createOrder);
router.get('/', getMyOrders);
router.get('/:orderId', getOrderById);
router.post('/:orderId/cancel', cancelOrder);

router.post('/razorpay', createRazorpayOrder);
router.post('/razorpay/verify', verifyRazorpayPayment);

module.exports = router;