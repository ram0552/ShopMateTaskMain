const express = require('express');
const router = express.Router();
const {registerUser,loginUser,refreshUserToken,resetPassword,sendPasswordResetOTP} = require('../controllers/userController');
const {verifyEmail} = require('../services/verify');

router.get('/verify-email/:token', verifyEmail);

router.post('/register', registerUser);

router.post('/login', loginUser);
router.post('/refresh', refreshUserToken);
router.post('/forget-password', sendPasswordResetOTP);
router.post('/reset-password', resetPassword);
module.exports = router;