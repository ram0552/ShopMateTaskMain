// import React from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import { ShopProvider } from './context/ShopContext';
// import Navbar from './components/Navbar';
// import Home from './pages/Home';
// import ProductDetails from './pages/ProductDetails';
// import Cart from './pages/Cart';
// import AdminDashboard from './pages/AdminDashboard';
// import SemanticSearch from './pages/SemanticSearch';

// function App() {
//     return (
//         <ShopProvider>
//             <Router>
//                 <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
//                     <Navbar />
//                     <Routes>
//                         <Route path="/" element={<Home />} />
//                         <Route path="/product/:id" element={<ProductDetails />} />
//                         <Route path="/cart" element={<Cart />} />
//                         <Route path="/admin" element={<AdminDashboard />} />
//                         <Route path="/semantic-search" element={<SemanticSearch />} />
//                     </Routes>
//                 </div>
//             </Router>
//             {/* <Routes>
//                         <Route path="/" element={<Home />} />
//                         <Route path="/product/:id" element={<ProductDetails />} />
//                         <Route path="/cart" element={<Cart />} />
//                         <Route path="/admin" element={<AdminDashboard />} />
//                         <Route path="/semantic-search" element={<SemanticSearch />} />
//                     </Routes> */}
//         </ShopProvider>
//     );
// }

// export default App;
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ShopProvider } from './context/ShopContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import ProductDetails from './pages/ProductDetails';
import Cart from './pages/Cart';
import AdminDashboard from './pages/AdminDashboard';
import SemanticSearch from './pages/SemanticSearch';
import ShopMateChatbot from './components/ShopMateChatbot';

function App() {
    return (
        <ShopProvider>
            <Router>
                <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
                    <Navbar />
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/product/:id" element={<ProductDetails />} />
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/semantic-search" element={<SemanticSearch />} />
                    </Routes>
                    <ShopMateChatbot />
                </div>
            </Router>
        </ShopProvider>
    );
}

export default App;
