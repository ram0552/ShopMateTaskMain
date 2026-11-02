const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { getCart, addCartItem,updateCartItem,removeCartItem ,clearCart} = require('../controllers/cartController');

 router.use(authenticate);

router.get('/', getCart);
router.post('/items', addCartItem);
router.patch('/items/:productId',  updateCartItem);
router.delete('/items/:productId',  removeCartItem);
router.delete('/',  clearCart);

module.exports = router;