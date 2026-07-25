import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, Menu } from 'lucide-react';
import { ShopContext } from '../context/ShopContext';
import logo from "../assets/shopmate.png";

const Navbar = () => {
    const { cart } = useContext(ShopContext);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    const isAdmin = user?.role === "admin";

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            navigate(`/semantic-search?q=${encodeURIComponent(searchTerm)}`);
            // setSearchTerm('');
        }
    };

    const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <nav className="bg-white shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    {/* Logo */}
                     <Link to="/" className="flex items-center gap-2">
                            <img
                                src={logo}
                                alt="ShopMate Logo"
                                className="h-9 w-9 md:h-11 md:w-11"
                            />

                            <span className="hidden font-bold text-xl sm:block">
                                ShopMate
                            </span>
                        </Link>

                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg mx-8 relative">
                        <input
                            type="text"
                            placeholder="Search for products..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                    </form>

                    {/* Right Icons */}
                    <div className="flex items-center space-x-6">
                        <Link to="/admin" className="text-gray-500 hover:text-black font-medium text-sm">
                            Admin
                        </Link>
                        <Link to="/cart" className="relative text-gray-500 hover:text-black transition-colors">
                            <ShoppingCart className="h-6 w-6" />
                            {cartCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-black text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                    {cartCount}
                                </span>
                            )}
                        </Link>
                        {isAdmin && (
                            <Link to="/admin/blogs" className="text-gray-500 hover:text-black font-medium text-sm">
                                Blog AI
                            </Link>
                        )}
                        <Link to="/logout" className='text-gray-500 hover:text-black font-medium text-sm'>
                            Logout
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
