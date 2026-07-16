// import React from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import { ShopProvider } from './context/ShopContext';
// import Navbar from './components/Navbar';
// import Home from './pages/Home';
// import ProductDetails from './pages/ProductDetails';
// import Cart from './pages/Cart';
// import AdminDashboard from './pages/AdminDashboard';
// import SemanticSearch from './pages/SemanticSearch';
// import ShopMateChatbot from './components/ShopMateChatbot';
// import Login from './pages/Login';
// import Register from './pages/Register';

// function App() {
//     return (
//         <ShopProvider>
//             <Router>
//                 <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
//                     <Navbar />
//                     <Routes>
//                         <Route path="/login" element={<Login />} />
//                         <Route path="/register" element={<Register />} />
//                         <Route path="/" element={<Home />} />
//                         <Route path="/product/:id" element={<ProductDetails />} />
//                         <Route path="/cart" element={<Cart />} />
//                         <Route path="/admin" element={<AdminDashboard />} />
//                         <Route path="/semantic-search" element={<SemanticSearch />} />
//                     </Routes>
//                     <ShopMateChatbot />
//                 </div>
//             </Router>
//         </ShopProvider>

//     );
// }

// export default App;


import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { ShopProvider } from './context/ShopContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import ProductDetails from './pages/ProductDetails';
import Cart from './pages/Cart';
import AdminDashboard from './pages/AdminDashboard';
import SemanticSearch from './pages/SemanticSearch';
import ShopMateChatbot from './components/ShopMateChatbot';
import Logout from './pages/Logout';
import Registerpage from './pages/Registerpage';
import Loginpage from './pages/Loginpage';
import ForgetPasswordPage from './pages/ForgetPasswordPage';
import BlogAdmin from './pages/BlogAdmin';
import BlogReview from './pages/BlogReview';


// Wraps layout so we can use useLocation inside Router
function AppLayout() {
    const location = useLocation();
    const hideNav = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forget-password' 
                    || location.pathname==='/logout';
        
    const hideChatbot =
                 location.pathname.startsWith("/admin")|| location.pathname === '/admin/blogs' 
                 || location.pathname.startsWith('/admin/blogs/') && location.pathname.endsWith('/review');
    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
            {!hideNav && <Navbar />}

            <Routes>
                {/* Public routes */}
                <Route path="/" element={<Navigate to="/login" />} />
                <Route path="/login" element={<Loginpage />} />
                <Route path="/register" element={<Registerpage />} />
                <Route path="/forget-password" element={<ForgetPasswordPage />} />
                <Route path="/logout" element={<Logout />} />

                {/* Protected: any logged-in user (admin or user) */}
                <Route path="/home" element={
                    <ProtectedRoute>
                        <Home />
                    </ProtectedRoute>
                } />
                <Route path="/product/:id" element={
                    <ProtectedRoute>
                        <ProductDetails />
                    </ProtectedRoute>
                } />
                <Route path="/cart" element={
                    <ProtectedRoute>
                        <Cart />
                    </ProtectedRoute>
                } />
                <Route path="/semantic-search" element={
                    <ProtectedRoute>
                        <SemanticSearch />
                    </ProtectedRoute>
                } />



                {/* Protected: admin only */}
                <Route path="/admin" element={
                    <ProtectedRoute role="admin">
                        <AdminDashboard />
                    </ProtectedRoute>
                } />
                <Route
                    path="/admin/blogs"
                    element={
                        <ProtectedRoute role="admin">
                            <BlogAdmin />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/admin/blogs/:id/review"
                    element={
                        <ProtectedRoute role="admin">
                            <BlogReview />
                        </ProtectedRoute>
                    }
                />

            </Routes>

            {!hideChatbot &&!hideNav && <ShopMateChatbot />}
        </div>
    );
}

function App() {
    return (
        <ShopProvider>
            <Router>
                <AppLayout />
            </Router>
        </ShopProvider>
    );
}

export default App;