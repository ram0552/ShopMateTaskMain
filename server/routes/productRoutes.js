const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    generateDescription,
    generateDetailsFromImage,
    semanticSearch
} = require('../controllers/productController');
const authenticate = require('../middleware/authenticate');
const autherizeRoles = require('../middleware/autherization');

router.get('/search/semantic', semanticSearch);

router.route('/')
    .get(authenticate,autherizeRoles('admin','user'),getProducts)
    .post(authenticate,autherizeRoles('admin'),createProduct);

router.route('/:id')
    .get(authenticate,autherizeRoles('admin','user'),getProductById)
    .put(authenticate,autherizeRoles('admin'),updateProduct)
    .delete(authenticate,autherizeRoles('admin'),deleteProduct);

router.post("/generate-description", generateDescription);

// --- Middleware Configuration ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.route('/generate-details-from-image')
    .post(upload.single('image'), generateDetailsFromImage);

module.exports = router;
