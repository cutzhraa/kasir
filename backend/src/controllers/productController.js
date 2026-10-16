const { pool } = require('../config/database');

const productController = {
    getAll: async (req, res, next) => {
        try {
            const { search } = req.query;
            const params = [];
            let query = 'SELECT * FROM produk WHERE is_active = TRUE';

            if (search) {
                params.push(`%${search}%`);
                query += ` AND (nama_barang ILIKE $1 OR barcode ILIKE $1 OR kode_sku ILIKE $1)`;
            }

            query += ' ORDER BY id DESC';
            const { rows } = await pool.query(query, params);
            res.json({ success: true, data: rows });
        } catch (error) {
            next(error);
        }
    },

    getByBarcodeOrSku: async (req, res, next) => {
        try {
            const { code } = req.params;
            const { rows: [product] } = await pool.query(
                'SELECT * FROM produk WHERE (barcode = $1 OR kode_sku = $1) AND is_active = TRUE',
                [code]
            );

            if (!product) {
                return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
            }
            res.json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    },

    create: async (req, res, next) => {
        try {
            const { nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum } = req.body;
            const productName = nama_barang;
            const sku = kode_sku || barcode || `SKU-${Date.now()}`;

            if (!productName || harga_jual === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Nama barang dan harga jual wajib diisi'
                });
            }

            const { rows: [newProduct] } = await pool.query(`
                INSERT INTO produk (nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [
                productName,
                barcode || null,
                sku,
                harga_beli || 0,
                harga_jual,
                stok || 0,
                stok_minimum || 5
            ]);
            res.status(201).json({ success: true, data: newProduct });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = productController;
