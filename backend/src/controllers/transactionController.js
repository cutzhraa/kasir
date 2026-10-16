const { pool, withTransaction } = require('../config/database');

function createRequestError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

const transactionController = {
    getAll: async (req, res, next) => {
        try {
            const { shift_id, limit = 50 } = req.query;
            const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
            const params = [];
            const filters = [];
            let query = `
                SELECT t.*, u.nama AS nama_kasir,
                       (SELECT COUNT(*) FROM detail_transaksi dt WHERE dt.transaksi_id = t.id) AS total_item_count,
                       (SELECT COALESCE(SUM(jumlah_beli), 0) FROM detail_transaksi dt WHERE dt.transaksi_id = t.id) AS total_item_qty
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
                JOIN sesi_shift s ON t.sesi_shift_id = s.id
            `;

            if (req.auth.role !== 'admin') {
                params.push(req.auth.id);
                filters.push(`s.user_id = $${params.length}`);
            }
            if (shift_id) {
                params.push(shift_id);
                filters.push(`t.sesi_shift_id = $${params.length}`);
            }
            if (filters.length) query += ` WHERE ${filters.join(' AND ')}`;
            params.push(safeLimit);
            query += ` ORDER BY t.id DESC LIMIT $${params.length}`;

            const { rows: transactions } = await pool.query(query, params);
            if (!transactions.length) {
                return res.json({ success: true, data: [] });
            }

            const ids = transactions.map((transaction) => transaction.id);
            const { rows: items } = await pool.query(`
                SELECT dt.*, p.nama_barang, p.kode_sku
                FROM detail_transaksi dt
                JOIN produk p ON dt.produk_id = p.id
                WHERE dt.transaksi_id = ANY($1::integer[])
                ORDER BY dt.id
            `, [ids]);
            const itemsByTransaction = new Map();
            for (const item of items) {
                const transactionItems = itemsByTransaction.get(item.transaksi_id) || [];
                transactionItems.push(item);
                itemsByTransaction.set(item.transaksi_id, transactionItems);
            }

            res.json({
                success: true,
                data: transactions.map((transaction) => ({
                    ...transaction,
                    items: itemsByTransaction.get(transaction.id) || []
                }))
            });
        } catch (error) {
            next(error);
        }
    },

    getById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { rows: [transaction] } = await pool.query(`
                SELECT t.*, u.nama AS nama_kasir
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
                JOIN sesi_shift s ON t.sesi_shift_id = s.id
                WHERE t.id = $1 AND ($3 = 'admin' OR s.user_id = $2)
            `, [id, req.auth.id, req.auth.role]);

            if (!transaction) {
                return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
            }

            const { rows: items } = await pool.query(`
                SELECT dt.*, p.nama_barang, p.kode_sku, p.barcode
                FROM detail_transaksi dt
                JOIN produk p ON dt.produk_id = p.id
                WHERE dt.transaksi_id = $1
                ORDER BY dt.id
            `, [id]);
            res.json({ success: true, data: { ...transaction, items } });
        } catch (error) {
            next(error);
        }
    },

    create: async (req, res, next) => {
        try {
            const {
                sesi_shift_id,
                items,
                metode_pembayaran = 'tunai',
                jumlah_bayar
            } = req.body;

            if (!sesi_shift_id || !kasir_id || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'sesi_shift_id, kasir_id, dan daftar items wajib diisi'
                });
            }

            const createdId = await withTransaction(async (client) => {
                const { rows: [shift] } = await client.query(
                    'SELECT * FROM sesi_shift WHERE id = $1 FOR UPDATE',
                    [sesi_shift_id]
                );
                if (!shift) throw createRequestError('Sesi shift tidak ditemukan', 404);
                if (shift.user_id !== req.auth.id) {
                    throw createRequestError('Sesi shift bukan milik kasir yang sedang login', 403);
                }
                if (shift.status_sesi !== 'aktif') {
                    throw createRequestError('Sesi shift ini sudah ditutup. Tidak dapat memproses transaksi baru.');
                }

                const requestedQuantities = new Map();
                for (const item of items) {
                    const productId = Number(item.produk_id);
                    const quantity = Number(item.jumlah_beli);
                    if (!Number.isSafeInteger(productId) || productId < 1 ||
                        !Number.isSafeInteger(quantity) || quantity < 1) {
                        throw createRequestError('Produk dan jumlah beli harus berupa bilangan bulat positif');
                    }
                    requestedQuantities.set(
                        productId,
                        (requestedQuantities.get(productId) || 0) + quantity
                    );
                }

                const productIds = [...requestedQuantities.keys()].sort((a, b) => a - b);
                const { rows: products } = await client.query(`
                    SELECT * FROM produk
                    WHERE id = ANY($1::integer[]) AND is_active = TRUE
                    ORDER BY id FOR UPDATE
                `, [productIds]);
                const productsById = new Map(products.map((product) => [product.id, product]));

                for (const [productId, quantity] of requestedQuantities) {
                    const product = productsById.get(productId);
                    if (!product) {
                        throw createRequestError(`Produk dengan ID ${productId} tidak ditemukan atau non-aktif`);
                    }
                    if (Number(product.stok) < quantity) {
                        throw createRequestError(
                            `Stok produk "${product.nama_barang}" tidak mencukupi (sisa ${product.stok})`
                        );
                    }
                }

                let totalHarga = 0;
                const preparedItems = items.map((item) => {
                    const product = productsById.get(Number(item.produk_id));
                    const quantity = Number(item.jumlah_beli);
                    const hargaSatuan = Number(product.harga_jual);
                    const hargaBeliSatuan = Number(product.harga_beli);
                    const subtotal = quantity * hargaSatuan;
                    totalHarga += subtotal;
                    return {
                        produk_id: product.id,
                        jumlah_beli: quantity,
                        harga_satuan: hargaSatuan,
                        harga_beli_satuan: hargaBeliSatuan,
                        subtotal
                    };
                });

                const bayar = Number(jumlah_bayar !== undefined ? jumlah_bayar : totalHarga);
                if (!Number.isFinite(bayar) || bayar < 0) {
                    throw createRequestError('Jumlah bayar tidak valid');
                }
                if (metode_pembayaran === 'tunai' && bayar < totalHarga) {
                    throw createRequestError('Jumlah bayar tunai kurang dari total belanja');
                }
                const kembalian = bayar - totalHarga;
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const nomorInvoice = `INV-${dateStr}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                const { rows: [transaction] } = await client.query(`
                    INSERT INTO transaksi (
                        nomor_invoice, sesi_shift_id, kasir_id, total_harga,
                        metode_pembayaran, jumlah_bayar, kembalian, status_transaksi
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'selesai')
                    RETURNING id
                `, [
                    nomorInvoice,
                    sesi_shift_id,
                    req.auth.id,
                    totalHarga,
                    metode_pembayaran,
                    bayar,
                    kembalian
                ]);

                for (const item of preparedItems) {
                    await client.query(`
                        INSERT INTO detail_transaksi (
                            transaksi_id, produk_id, jumlah_beli, harga_satuan, harga_beli_satuan, subtotal
                        )
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        transaction.id,
                        item.produk_id,
                        item.jumlah_beli,
                        item.harga_satuan,
                        item.harga_beli_satuan,
                        item.subtotal
                    ]);
                }

                for (const [productId, quantity] of requestedQuantities) {
                    await client.query(
                        'UPDATE produk SET stok = stok - $1, updated_at = NOW() WHERE id = $2',
                        [quantity, productId]
                    );
                }

                return transaction.id;
            });

            const { rows: [createdTransaction] } = await pool.query(`
                SELECT t.*, u.nama AS nama_kasir
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
                WHERE t.id = $1
            `, [createdId]);
            const { rows: createdItems } = await pool.query(`
                SELECT dt.*, p.nama_barang, p.kode_sku, p.barcode
                FROM detail_transaksi dt
                JOIN produk p ON dt.produk_id = p.id
                WHERE dt.transaksi_id = $1
                ORDER BY dt.id
            `, [createdId]);

            res.status(201).json({
                success: true,
                message: 'Transaksi berhasil disimpan dan stok produk telah diperbarui',
                data: { ...createdTransaction, items: createdItems }
            });
        } catch (error) {
            if (error.code === '23514' || error.code === '23503') {
                return res.status(400).json({
                    success: false,
                    message: 'Data transaksi tidak valid'
                });
            }
            next(error);
        }
    }
};

module.exports = transactionController;
