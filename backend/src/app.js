const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const requireAuth = require('./middlewares/requireAuth');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000'
].join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
    const { pool } = require('./config/database');
    pool.query('SELECT 1')
        .then(() => res.json({
            status: 'OK',
            message: 'POS API dan database Supabase berjalan normal',
            timestamp: new Date().toISOString()
        }))
        .catch((error) => {
            console.error('Health check database gagal:', error);
            res.status(503).json({
                status: 'ERROR',
                message: 'Database tidak dapat diakses'
            });
        });
});

// Endpoint Produk (Bahasa Indonesia & Bahasa Inggris)
app.use('/api/produk', requireAuth, productRoutes);
app.use('/api/products', requireAuth, productRoutes);

// Endpoint Shift (Bahasa Indonesia & Bahasa Inggris serta variasi typo shif/shift)
app.use('/api/shift', requireAuth, shiftRoutes);
app.use('/api/shif', requireAuth, shiftRoutes);
app.use('/api/shifts', requireAuth, shiftRoutes);

// Endpoint Transaksi & Auth
app.use('/api/transaksi', requireAuth, transactionRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/auth', authRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
