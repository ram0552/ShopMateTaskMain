const express = require('express');
const router = express.Router();
const { registerUser, loginUser, refreshUserToken, resetPassword, sendPasswordResetOTP,googleLogin } = require('../controllers/userController');
const { verifyEmail } = require('../services/verify');
const { authLimiter } = require('../middleware/rateLimit.middleware');

router.get('/verify-email/:token', verifyEmail);

router.post('/register', registerUser);

router.post('/login',authLimiter, loginUser);
router.post("/google",authLimiter, googleLogin);
router.post('/refresh', refreshUserToken);
router.post('/forget-password',authLimiter, sendPasswordResetOTP);
router.post('/reset-password',authLimiter, resetPassword);
module.exports = router;