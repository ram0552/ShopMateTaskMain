import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, Edit, Plus, X, Camera } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;

const AdminDashboard = () => {
    const [products, setProducts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
    const [isGeneratingFromImage, setIsGeneratingFromImage] = useState(false);
    const [imageFile, setImageFile] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        stock: '',
        image: ''
    });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const response = await axios.get(`${API}/api/products`);
            setProducts(response.data);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this product?')) return;
        try {
            await axios.delete(`${API}/api/products/${id}`);
            fetchProducts();
        } catch (error) {
            console.error('Error deleting product:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingProduct) {
                await axios.put(
                    `${API}/api/products/${editingProduct._id}`,
                    formData
                );
            } else {
                await axios.post(
                    `${API}/api/products`,
                    formData
                );
            }

            setIsModalOpen(false);
            setEditingProduct(null);
            setImageFile(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                category: '',
                stock: '',
                image: ''
            });
            fetchProducts();
        } catch (error) {
            console.error('Error saving product:', error);
        }
    };

    const generateDescription = async () => {
        if (!formData.name && !formData.category) {
            alert('Please enter a product name or category first');
            return;
        }

        setIsGeneratingDescription(true);
        try {
            const response = await axios.post(
                `${API}/api/products/generate-description`,
                {
                    name: formData.name,
                    features: formData.category
                }
            );
            setFormData(prev => ({
                ...prev,
                description: response.data.description
            }));
        } catch (error) {
            console.error('Error generating description:', error);
        } finally {
            setIsGeneratingDescription(false);
        }
    };

    const generateDetailsFromImage = async () => {
        if (!imageFile) {
            alert('Please upload an image first');
            return;
        }

        setIsGeneratingFromImage(true);
        const data = new FormData();
        data.append('image', imageFile);

        try {
            const response = await axios.post(
                `${API}/api/products/generate-details-from-image`,
                data,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            const { name, description, category } = response.data.data;
            setFormData(prev => ({
                ...prev,
                name,
                description,
                category
            }));
        } catch (error) {
            console.error('Error generating details:', error);
        } finally {
            setIsGeneratingFromImage(false);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImageFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
            setFormData(prev => ({
                ...prev,
                image: ev.target.result
            }));
        };
        reader.readAsDataURL(file);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setImageFile(null);
        setFormData({
            name: product.name,
            description: product.description,
            price: product.price,
            category: product.category,
            stock: product.stock,
            image: product.image
        });
        setIsModalOpen(true);
    };

    const openAddModal = () => {
        setEditingProduct(null);
        setImageFile(null);
        setFormData({
            name: '',
            description: '',
            price: '',
            category: '',
            stock: '',
            image: ''
        });
        setIsModalOpen(true);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                <button
                    onClick={openAddModal}
                    className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800"
                >
                    <Plus size={20} /> Add Product
                </button>
            </div>

            {/* table + modal UI unchanged */}
        </div>
    );
};

export default AdminDashboard;
