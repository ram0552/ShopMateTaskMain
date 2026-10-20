
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const getCartCollection = () => getDB().collection('carts');
const getProductCollection = () => getDB().collection('products');

const getUserId = (req) => {
    const userId = req.user?.id;

    if (!userId || !ObjectId.isValid(userId.toString())) {
        return null;
    }

    return new ObjectId(userId.toString());
};

// GET /api/cart
const getCart = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({ message: 'Invalid user identity' });
        }

        const cart = await getCartCollection().findOne({ userId });

        if (!cart || cart.items.length === 0) {
            return res.json({ items: [] });
        }

        const productIds = cart.items.map(item => item.productId);
        const products = await getProductCollection()
            .find({ _id: { $in: productIds } })
            .toArray();

        const productMap = new Map(
            products.map(product => [product._id.toString(), product])
        );

        const items = cart.items.flatMap(item => {
            const product = productMap.get(item.productId.toString());

            // Hide products that have been deleted.
            if (!product) return [];

            return [{
                productId: product._id,
                name: product.name,
                price: product.price,
                image: product.image || '',
                stock: product.stock ?? 0,
                quantity: item.quantity,
                subtotal: product.price * item.quantity
            }];
        });

        res.json({ items });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ message: 'Unable to retrieve cart' });
    }
};

// POST /api/cart/items
const addCartItem = async (req, res) => {
    try {
        const userId = getUserId(req);
        const { productId, quantity = 1 } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Invalid user identity' });
        }

        if (
            typeof productId !== 'string' ||
            !ObjectId.isValid(productId) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 100
        ) {
            return res.status(400).json({
                message: 'A valid product ID and quantity between 1 and 100 are required'
            });
        }

        const productObjectId = new ObjectId(productId);
        const product = await getProductCollection().findOne({
            _id: productObjectId
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (!Number.isFinite(product.price) || product.price < 0) {
            return res.status(409).json({ message: 'Product price is invalid' });
        }

        const stock = Number.isSafeInteger(product.stock) ? product.stock : 0;

        const carts = getCartCollection();
        const cart = await carts.findOne({ userId });
        const existingItem = cart?.items.find(
            item => item.productId.toString() === productId
        );

        const nextQuantity = (existingItem?.quantity || 0) + quantity;

        if (nextQuantity > stock) {
            return res.status(409).json({
                message: 'Requested quantity exceeds available stock',
                availableStock: stock
            });
        }

        await carts.updateOne(
            { userId },
            {
                $set: {
                    updatedAt: new Date(),
                    ...(existingItem
                        ? {
                            'items.$[item].quantity': nextQuantity
                        }
                        : {})
                },
                ...(!existingItem
                    ? {
                        $push: {
                            items: {
                                productId: productObjectId,
                                quantity
                            }
                        }
                    }
                    : {})
            },
            existingItem
                ? {
                    arrayFilters: [{ 'item.productId': productObjectId }]
                }
                : {}
        ).then(async result => {
            if (result.matchedCount === 0) {
                await carts.updateOne(
                    { userId },
                    {
                        $setOnInsert: {
                            userId,
                            items: [],
                            createdAt: new Date()
                        },
                        $set: { updatedAt: new Date() }
                    },
                    { upsert: true }
                );

                // Retry after ensuring the user's cart exists.
                await carts.updateOne(
                    { userId },
                    {
                        $push: {
                            items: { productId: productObjectId, quantity }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
            }
        });

        res.status(200).json({ message: 'Cart updated successfully' });
    } catch (error) {
        console.error('Add cart item error:', error);
        res.status(500).json({ message: 'Unable to update cart' });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const userId = getUserId(req);
        const { productId } = req.params;
        const { quantity } = req.body;

        if (!userId) {
            return res.status(401).json({
                message: 'Invalid user identity'
            });
        }

        if (
            typeof productId !== 'string' ||
            !ObjectId.isValid(productId) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 100
        ) {
            return res.status(400).json({
                message: 'Valid product ID and quantity between 1 and 100 are required'
            });
        }

        const productObjectId = new ObjectId(productId);

        const product = await getProductCollection().findOne({
            _id: productObjectId
        });

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        const stock = Number.isSafeInteger(product.stock)
            ? product.stock
            : 0;

        if (quantity > stock) {
            return res.status(409).json({
                message: 'Requested quantity exceeds available stock',
                availableStock: stock
            });
        }

        const result = await getCartCollection().updateOne(
            {
                userId,
                items: {
                    $elemMatch: { productId: productObjectId }
                }
            },
            {
                $set: {
                    'items.$[item].quantity': quantity,
                    updatedAt: new Date()
                }
            },
            {
                arrayFilters: [
                    { 'item.productId': productObjectId }
                ]
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: 'Cart item not found'
            });
        }

        return res.status(200).json({
            message: 'Cart quantity updated successfully'
        });
    } catch (error) {
        console.error('Update cart item error:', error);

        return res.status(500).json({
            message: 'Unable to update cart item'
        });
    }
};
const removeCartItem = async (req, res) => {
    try {
        const userId = getUserId(req);
        const { productId } = req.params;

        if (!userId) {
            return res.status(401).json({
                message: 'Invalid user identity'
            });
        }

        if (
            typeof productId !== 'string' ||
            !ObjectId.isValid(productId)
        ) {
            return res.status(400).json({
                message: 'Invalid product ID'
            });
        }

        const productObjectId = new ObjectId(productId);

        const result = await getCartCollection().updateOne(
            {
                userId,
                items: {
                    $elemMatch: { productId: productObjectId }
                }
            },
            {
                $pull: {
                    items: { productId: productObjectId }
                },
                $set: {
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: 'Cart item not found'
            });
        }

        return res.status(200).json({
            message: 'Cart item removed successfully'
        });
    } catch (error) {
        console.error('Remove cart item error:', error);

        return res.status(500).json({
            message: 'Unable to remove cart item'
        });
    }
};

const clearCart = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                message: 'Invalid user identity'
            });
        }

        const result = await getCartCollection().updateOne(
            { userId },
            {
                $set: {
                    items: [],
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: 'Cart not found'
            });
        }

        return res.status(200).json({
            message: 'Cart cleared successfully'
        });
    } catch (error) {
        console.error('Clear cart error:', error);

        return res.status(500).json({
            message: 'Unable to clear cart'
        });
    }
};

module.exports = { getCart, addCartItem , updateCartItem, removeCartItem, clearCart };
