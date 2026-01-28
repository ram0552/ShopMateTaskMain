const express = require('express');
const multer = require("multer");
const router = express.Router();
const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    generateDescription,
    generateDetailsFromImage
} = require('../controllers/productController');

router.route('/')
    .get(getProducts)
    .post(createProduct);

router.route('/:id')
    .get(getProductById)
    .put(updateProduct)
    .delete(deleteProduct);

router.post("/generate-description",generateDescription);

// --- Middleware Configuration ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.route('/generate-details-from-image')
    .post(upload.single('image'), generateDetailsFromImage);
const {
    semanticSearch
} = require('../controllers/productController');

router.get('/search/semantic', semanticSearch);
module.exports = router;