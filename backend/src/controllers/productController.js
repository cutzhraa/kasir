const db = require('../config/database');

const productController = {
    // Ambil daftar semua produk
    getAll: (req, res, next) => {
        try {
            const { search } = req.query;
            let query = 'SELECT * FROM produk WHERE is_active = 1';
            let params = [];

            if (search) {
                query += ' AND (nama_barang LIKE ? OR barcode LIKE ? OR kode_sku LIKE ?)';
                const term = `%${search}%`;
                params = [term, term, term];
            }

            query += ' ORDER BY id DESC';
            const products = db.prepare(query).all(...params);
            res.json({ success: true, data: products });
        } catch (error) {
            next(error);
        }
    },

    // Cari produk spesifik berdasarkan Barcode / SKU
    getByBarcodeOrSku: (req, res, next) => {
        try {
            const { code } = req.params;
            const product = db.prepare(
                'SELECT * FROM produk WHERE (barcode = ? OR kode_sku = ?) AND is_active = 1'
            ).get(code, code);

            if (!product) {
                return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
            }
            res.json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    },

    // Tambah produk baru
    create: (req, res, next) => {
        try {
            const { nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum } = req.body;

            const sku = kode_sku || barcode || `SKU-${Date.now()}`;
            const bar = barcode || null;

            if (!nama_barang || harga_jual === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Nama barang dan harga jual wajib diisi'
                });
            }

            const stmt = db.prepare(`
                INSERT INTO produk (nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                nama_barang,
                bar,
                sku,
                harga_beli || 0,
                harga_jual,
                stok || 0,
                stok_minimum || 5
            );

            const newProduct = db.prepare('SELECT * FROM produk WHERE id = ?').get(result.lastInsertRowid);
            res.status(201).json({ success: true, data: newProduct });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = productController;

