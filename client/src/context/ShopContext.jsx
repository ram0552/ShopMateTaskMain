import React, { createContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import api from '../utils/api';
export const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const isFetching = useRef(false);

    // const fetchProducts = async (search = '') => {
    //     try {
    //         setLoading(true);
    //         const response = await api.get(`/products?search=${search}`);
    //         setProducts(response.data);
    //     } catch (error) {
    //         console.error('Error fetching products:', error);
    //     } finally {
    //         setLoading(false);
    //     }
    // };


    const fetchProducts = async (search = "", force = false) => {
        if (!force && products.length > 0 && !search) {
            return;
        }
        if (isFetching.current) {
            return;
        }
        try {
            isFetching.current = true;
            console.log("Fetching products...");
            setLoading(true);
            const response = await api.get(`/products?search=${search}`);
            console.log("Products response:", response);
            setProducts(response.data);
        } catch (error) {
            console.error("FULL ERROR:", error);
            console.error("STATUS:", error.response?.status);
            console.error("DATA:", error.response?.data);
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    };

    const addToCart = (product) => {
        setCart((prevCart) => {
            const existingItem = prevCart.find((item) => item._id === product._id);
            if (existingItem) {
                return prevCart.map((item) =>
                    item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId) => {
        setCart((prevCart) => prevCart.filter((item) => item._id !== productId));
    };

    const updateQuantity = (productId, amount) => {
        setCart((prevCart) =>
            prevCart.map((item) => {
                if (item._id === productId) {
                    const newQuantity = item.quantity + amount;
                    return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
                }
                return item;
            })
        );
    };

    const clearCart = () => {
        setCart([]);
    };

    return (
        <ShopContext.Provider
            value={{
                products,
                cart,
                loading,
                fetchProducts,
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
