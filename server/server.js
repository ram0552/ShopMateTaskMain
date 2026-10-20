const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const aiRoutes = require('./routes/aiRoutes');
const userRoutes = require('./routes/userRoutes');
const blogRoutes = require('./routes/blogRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');

const helmet = require('helmet');
const rateLimit = require("express-rate-limit");

// const generalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 50, // Limit each IP to 50 requests per windowMs
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: {
//     success: false,
//     message: "Too many requests. Please try again later."
//   }
// });

dotenv.config();

const app = express();
app.use(helmet());
const PORT = process.env.PORT || 3001;

// Increase limit to 5MB (or higher if needed)
// This is required for file upload if your image is > 100kb
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
// app.use(generalLimiter); // Apply rate limiting to all requests

// Middleware
app.use(cors());

// Routes
app.use('/api/products', productRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);


app.get('/', (req, res) => {
    res.send('ShopMATE API is running...');
});

// Connect to DB and start server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});