const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

const app = express();

// Konfigurasi CORS agar bisa diakses dari Frontend Vite (localhost:5173)
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'POS API Backend berjalan normal',
        timestamp: new Date().toISOString()
    });
});

// Endpoint Produk (Bahasa Indonesia & Bahasa Inggris)
app.use('/api/produk', productRoutes);
app.use('/api/products', productRoutes);

// Endpoint Shift (Bahasa Indonesia & Bahasa Inggris serta variasi typo shif/shift)
app.use('/api/shift', shiftRoutes);
app.use('/api/shif', shiftRoutes);
app.use('/api/shifts', shiftRoutes);

// Endpoint Transaksi & Auth
app.use('/api/transaksi', transactionRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/auth', authRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
