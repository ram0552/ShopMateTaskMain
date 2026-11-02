const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ---------------------------------------------------------------------------
// Startup: fail fast if critical payment gateway credentials are missing.
// ---------------------------------------------------------------------------
const REQUIRED_RAZORPAY_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const missingKeys = REQUIRED_RAZORPAY_KEYS.filter(
  (key) => !process.env[key]?.trim()
);
if (missingKeys.length > 0) {
  console.error(
    `[STARTUP] FATAL: Missing required environment variables: ${missingKeys.join(', ')}.\n` +
    `         Copy server/.env.example to server/.env and fill in the values.`
  );
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const aiRoutes = require('./routes/aiRoutes');
const userRoutes = require('./routes/userRoutes');
const blogRoutes = require('./routes/blogRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// IMPORTANT: The Razorpay webhook route MUST be mounted BEFORE express.json()
// so that the raw body buffer is preserved for HMAC signature verification.
// express.json() would parse the body into a JS object, destroying the buffer.
// ---------------------------------------------------------------------------
app.use('/api/payment', paymentRoutes);

// Global JSON / URL-encoded body parsers (applied after the raw webhook route).
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

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