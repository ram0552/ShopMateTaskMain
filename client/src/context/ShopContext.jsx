// import React, { createContext, useState, useEffect, useRef } from 'react';
// import axios from 'axios';
// import api from '../utils/api';
// export const ShopContext = createContext();

// export const ShopProvider = ({ children }) => {
//     const [products, setProducts] = useState([]);
//     const [cart, setCart] = useState([]);
//     const [loading, setLoading] = useState(true);
//    // const isFetching = useRef(false);


//     const [pagination, setPagination] = useState({
//         page: 1,
//         limit: 20,
//         totalProducts: 0,
//         totalPages: 0,
//         hasNextPage: false,
//         hasPreviousPage: false,
//     });

//     // const fetchProducts = async (search = '') => {
//     //     try {
//     //         setLoading(true);
//     //         const response = await api.get(`/products?search=${search}`);
//     //         setProducts(response.data);
//     //     } catch (error) {
//     //         console.error('Error fetching products:', error);
//     //     } finally {
//     //         setLoading(false);
//     //     }
//     // };


//     // const fetchProducts = async (search = "", force = false) => {
//     //     if (!force && products.length > 0 && !search) {
//     //         return;
//     //     }
//     //     if (isFetching.current) {
//     //         return;
//     //     }
//     //     try {
//     //         isFetching.current = true;
//     //         console.log("Fetching products...");
//     //         setLoading(true);
//     //         const response = await api.get(`/products?search=${search}`);
//     //         console.log("Products response:", response);
//     //         setProducts(response.data);
//     //     } catch (error) {
//     //         console.error("FULL ERROR:", error);
//     //         console.error("STATUS:", error.response?.status);
//     //         console.error("DATA:", error.response?.data);
//     //     } finally {
//     //         setLoading(false);
//     //         isFetching.current = false;
//     //     }
//     // };
//     const isFetching = useRef(false);
//     // const fetchProducts = async (
//     //     search = '',
//     //     page = 1,
//     //     limit = 20,
//     //     force = false
//     // ) => {
//     //     if (!force && isFetching.current) {
//     //         return;
//     //     }

//     //     try {
//     //         isFetching.current = true;
//     //         setLoading(true);

//     //         console.log(
//     //             `Fetching products - page: ${page}, limit: ${limit}, search: "${search}"`
//     //         );

//     //         const response = await api.get('/products', {
//     //             params: {
//     //                 search,
//     //                 page,
//     //                 limit,
//     //             },
//     //         });

//     //         console.log('Products response:', response.data);

//     //         setProducts(response.data.products || []);

//     //         setPagination(
//     //             response.data.pagination || {
//     //                 page,
//     //                 limit,
//     //                 totalProducts: 0,
//     //                 totalPages: 0,
//     //                 hasNextPage: false,
//     //                 hasPreviousPage: false,
//     //             }
//     //         );
//     //     } catch (error) {
//     //         console.error('FULL ERROR:', error);
//     //         console.error('STATUS:', error.response?.status);
//     //         console.error('DATA:', error.response?.data);

//     //         setProducts([]);
//     //     } finally {
//     //         setLoading(false);
//     //         isFetching.current = false;
//     //     }
//     // };

    
// const fetchProducts = async (
//     search = '',
//     page = 1,
//     limit = 20,
//     category = 'All',
//     force = false
// ) => {
//     if (!force && isFetching.current) {
//         return;
//     }

//     try {
//         isFetching.current = true;
//         setLoading(true);

//         const response = await api.get('/products', {
//             params: {
//                 search,
//                 category: category === 'All' ? undefined : category,
//                 page,
//                 limit,
//             },
//         });

//         setProducts(response.data.products || []);

//         setPagination(
//             response.data.pagination || {
//                 page,
//                 limit,
//                 totalProducts: 0,
//                 totalPages: 0,
//                 hasNextPage: false,
//                 hasPreviousPage: false,
//             }
//         );
//     } catch (error) {
//         console.error('Error fetching products:', error);
//         setProducts([]);
//     } finally {
//         setLoading(false);
//         isFetching.current = false;
//     }
// };


//     const addToCart = (product) => {
//         setCart((prevCart) => {
//             const existingItem = prevCart.find((item) => item._id === product._id);
//             if (existingItem) {
//                 return prevCart.map((item) =>
//                     item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
//                 );
//             }
//             return [...prevCart, { ...product, quantity: 1 }];
//         });
//     };

//     const removeFromCart = (productId) => {
//         setCart((prevCart) => prevCart.filter((item) => item._id !== productId));
//     };

//     const updateQuantity = (productId, amount) => {
//         setCart((prevCart) =>
//             prevCart.map((item) => {
//                 if (item._id === productId) {
//                     const newQuantity = item.quantity + amount;
//                     return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
//                 }
//                 return item;
//             })
//         );
//     };

//     const clearCart = () => {
//         setCart([]);
//     };

//     return (
//         <ShopContext.Provider
//             value={{
//                 products,
//                 cart,
//                 loading,
//                 pagination,
//                 fetchProducts,
//                 addToCart,
//                 removeFromCart,
//                 updateQuantity,
//                 clearCart,
//             }}
//         >
//             {children}
//         </ShopContext.Provider>
//     );
// };


import React, {
    createContext,
    useState,
    useEffect,
    useRef,
    useCallback,
} from 'react';
import api from '../utils/api';

export const ShopContext = createContext();

const getStoredAuth = () => {
    try {
        const token = localStorage.getItem('accessToken');
        const user = JSON.parse(localStorage.getItem('user') || 'null');

        const identity = user
            ? String(user._id || user.id || user.email || '')
            : '';

        return {
            token,
            identity: token ? identity || token : '',
        };
    } catch {
        return {
            token: localStorage.getItem('accessToken'),
            identity: localStorage.getItem('accessToken') || '',
        };
    }
};

const normalizeCartItems = (items = []) =>
    items.map((item) => ({
        ...item,
        _id: String(item.productId),
        productId: String(item.productId),
        quantity: item.quantity,
    }));

export const ShopProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cartLoading, setCartLoading] = useState(false);
    const [cartInitialized, setCartInitialized] = useState(false);

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        totalProducts: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
    });

    const isFetching = useRef(false);
    const cartRequestId = useRef(0);

    const [authIdentity, setAuthIdentity] = useState(
        () => getStoredAuth().identity
    );

    // Keep the context synchronized with login, logout, and account changes.
    useEffect(() => {
        const syncAuth = () => {
            const nextAuth = getStoredAuth();

            cartRequestId.current += 1;
            setCart([]);
            setAuthIdentity(nextAuth.identity);
        };

        window.addEventListener('shopmate:auth-changed', syncAuth);
        window.addEventListener('storage', syncAuth);

        return () => {
            window.removeEventListener('shopmate:auth-changed', syncAuth);
            window.removeEventListener('storage', syncAuth);
        };
    }, []);

    const fetchProducts = async (
        search = '',
        page = 1,
        limit = 20,
        category = 'All',
        force = false
    ) => {
        if (!force && isFetching.current) {
            return;
        }

        try {
            isFetching.current = true;
            setLoading(true);

            const response = await api.get('/products', {
                params: {
                    search,
                    category: category === 'All' ? undefined : category,
                    page,
                    limit,
                },
            });

            setProducts(response.data.products || []);

            setPagination(
                response.data.pagination || {
                    page,
                    limit,
                    totalProducts: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPreviousPage: false,
                }
            );
        } catch (error) {
            console.error(
                'Error fetching products:',
                error.response?.status,
                error.response?.data || error.message
            );
            // Preserve existing products if a request fails.
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    };

    // Load the authenticated user's cart from MongoDB.
      // Load the authenticated user's cart from MongoDB.
        const fetchCart = useCallback(async () => {
                const requestId = ++cartRequestId.current;
                const auth = getStoredAuth();

                if (!auth.token || !auth.identity) {
                    setCart([]);
                    setCartLoading(false);
                    setCartInitialized(true);
                    return false;
                }

                try {
                    // Only show the loading screen on the initial fetch.
                    if (!cartInitialized) {
                        setCartLoading(true);
                    }
                    

                    const response = await api.get('/cart');
                    console.log("[Cart Debug] API response:", response.data);
                    console.log("[Cart Debug] Items before normalization:", response.data.items);
                    
                    const latestAuth = getStoredAuth();

                    if (
                        requestId !== cartRequestId.current ||
                        latestAuth.identity !== auth.identity
                    ) {
                        return false;
                    }
                    const normalizedItems = normalizeCartItems(response.data.items || []);

                    console.log("[Cart Debug] Normalized items:", normalizedItems);

                    setCart(normalizedItems);

                    // setCart(normalizeCartItems(response.data.items || []));
                    return true;
                } catch (error) {
                    console.error(
                        'Error fetching cart:',
                        error.response?.data || error.message
                    );

                    if (requestId === cartRequestId.current) {
                        setCart([]);
                    }

                    return false;
                } finally {
                    if (requestId === cartRequestId.current) {
                        setCartLoading(false);
                        setCartInitialized(true);
                    }
                }
            }, [cartInitialized]);


    useEffect(() => {
        if (!authIdentity || !getStoredAuth().token) {
            setCart([]);
            setCartLoading(false);
            return;
        }

        fetchCart();

        return () => {
            // Invalidate requests when the authentication identity changes.
            cartRequestId.current += 1;
        };
    }, [authIdentity, fetchCart]);

    // Add one unit of a product to the persistent cart.
    const addToCart = async (product) => {
        const productId = String(product?._id || product?.productId || '');

        if (!productId || !getStoredAuth().token) {
            return false;
        }

        try {
            await api.post('/cart/items', {
                productId,
                quantity: 1,
            });

            return await fetchCart();
        } catch (error) {
            console.error(
                'Error adding cart item:',
                error.response?.data || error.message
            );
            return false;
        }
    };

    const removeFromCart = async (productId) => {
        if (!getStoredAuth().token) {
            return false;
        }

        try {
            await api.delete(
                `/cart/items/${encodeURIComponent(String(productId))}`
            );

            return await fetchCart();
        } catch (error) {
            console.error(
                'Error removing cart item:',
                error.response?.data || error.message
            );
            return false;
        }
    };

    // Preserves the existing API: amount is a delta, such as +1 or -1.
    const updateQuantity = async (productId, amount) => {
    const item = cart.find(
        (entry) => String(entry._id) === String(productId)
    );

    if (!item || !Number.isSafeInteger(amount) || amount === 0) {
        return false;
    }

    const nextQuantity = item.quantity + amount;

    if (nextQuantity <= 0) {
        return removeFromCart(productId);
    }

    try {
        await api.patch(
            `/cart/items/${encodeURIComponent(String(productId))}`,
            { quantity: nextQuantity }
        );

        setCart((previousCart) =>
            previousCart.map((entry) =>
                String(entry._id) === String(productId)
                    ? { ...entry, quantity: nextQuantity }
                    : entry
            )
        );

        return true;
    } catch (error) {
        console.error(
            "Error updating cart quantity:",
            error.response?.status,
            error.response?.data || error.message
        );

        return false;
    }
};

    const clearCart = async () => {
        if (!getStoredAuth().token) {
            setCart([]);
            return false;
        }

        if (cart.length === 0) {
            setCart([]);
            return true;
        }

        try {
            await api.delete('/cart');
            setCart([]);
            return true;
        } catch (error) {
            console.error(
                'Error clearing cart:',
                error.response?.data || error.message
            );
            return false;
        }
    };

    return (
        <ShopContext.Provider
            value={{
                products,
                cart,
                loading,
                cartLoading,
                cartInitialized,
                pagination,
                fetchProducts,
                fetchCart,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
            }}
        >
            {children}
        </ShopContext.Provider>
    );
};