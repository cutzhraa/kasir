const db = require('../config/database');

const transactionController = {
    // Ambil daftar riwayat transaksi terbaru beserta itemnya
    getAll: (req, res, next) => {
        try {
            const { shift_id, limit = 50 } = req.query;
            let query = `
                SELECT t.*, u.nama as nama_kasir,
                       (SELECT COUNT(*) FROM detail_transaksi dt WHERE dt.transaksi_id = t.id) as total_item_count,
                       (SELECT COALESCE(SUM(jumlah_beli), 0) FROM detail_transaksi dt WHERE dt.transaksi_id = t.id) as total_item_qty
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
            `;
            let params = [];

            if (shift_id) {
                query += ' WHERE t.sesi_shift_id = ?';
                params.push(shift_id);
            }

            query += ' ORDER BY t.id DESC LIMIT ?';
            params.push(Number(limit));

            const transactions = db.prepare(query).all(...params);

            // Tambahkan detail item barang pada setiap transaksi riwayat
            const fullTransactions = transactions.map((trx) => {
                const items = db.prepare(`
                    SELECT dt.*, p.nama_barang, p.kode_sku
                    FROM detail_transaksi dt
                    JOIN produk p ON dt.produk_id = p.id
                    WHERE dt.transaksi_id = ?
                `).all(trx.id);
                return { ...trx, items };
            });

            res.json({ success: true, data: fullTransactions });
        } catch (error) {
            next(error);
        }
    },

    // Ambil detail satu transaksi lengkap dengan itemnya
    getById: (req, res, next) => {
        try {
            const { id } = req.params;
            const trx = db.prepare(`
                SELECT t.*, u.nama as nama_kasir
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
                WHERE t.id = ?
            `).get(id);

            if (!trx) {
                return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
            }

            const items = db.prepare(`
                SELECT dt.*, p.nama_barang, p.kode_sku, p.barcode
                FROM detail_transaksi dt
                JOIN produk p ON dt.produk_id = p.id
                WHERE dt.transaksi_id = ?
            `).all(id);

            res.json({ success: true, data: { ...trx, items } });
        } catch (error) {
            next(error);
        }
    },

    // Buat transaksi baru (Checkout kasir dengan pengurangan stok otomatis)
    create: (req, res, next) => {
        try {
            const {
                sesi_shift_id,
                kasir_id,
                items, // Array of { produk_id, jumlah_beli }
                metode_pembayaran = 'tunai',
                jumlah_bayar
            } = req.body;

            if (!sesi_shift_id || !kasir_id || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'sesi_shift_id, kasir_id, dan daftar items wajib diisi'
                });
            }

            // 1. Verifikasi shift masih aktif
            const shift = db.prepare('SELECT * FROM sesi_shift WHERE id = ?').get(sesi_shift_id);
            if (!shift) {
                return res.status(404).json({ success: false, message: 'Sesi shift tidak ditemukan' });
            }
            if (shift.status_sesi !== 'aktif') {
                return res.status(400).json({
                    success: false,
                    message: 'Sesi shift ini sudah ditutup. Tidak dapat memproses transaksi baru.'
                });
            }

            // 2. Transaksi database atomic (Integritas ACID)
            const executeTransaction = db.transaction(() => {
                let totalHarga = 0;
                const preparedItems = [];

                // Validasi setiap item & hitung subtotal dengan snapshot harga saat ini
                for (const item of items) {
                    const product = db.prepare('SELECT * FROM produk WHERE id = ? AND is_active = 1').get(item.produk_id);
                    if (!product) {
                        throw new Error(`Produk dengan ID ${item.produk_id} tidak ditemukan atau non-aktif`);
                    }

                    if (product.stok < item.jumlah_beli) {
                        throw new Error(`Stok produk "${product.nama_barang}" tidak mencukupi (sisa ${product.stok})`);
                    }

                    const qty = Number(item.jumlah_beli);
                    const hargaSatuan = Number(product.harga_jual);
                    const hargaBeliSatuan = Number(product.harga_beli);
                    const subtotal = qty * hargaSatuan;

                    totalHarga += subtotal;
                    preparedItems.push({
                        produk_id: product.id,
                        nama_barang: product.nama_barang,
                        jumlah_beli: qty,
                        harga_satuan: hargaSatuan,
                        harga_beli_satuan: hargaBeliSatuan,
                        subtotal
                    });
                }

                const bayar = Number(jumlah_bayar !== undefined ? jumlah_bayar : totalHarga);
                if (metode_pembayaran === 'tunai' && bayar < totalHarga) {
                    throw new Error('Jumlah bayar tunai kurang dari total belanja');
                }
                const kembalian = bayar - totalHarga;

                // Generate Invoice Unik
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const randomCode = Math.floor(1000 + Math.random() * 9000);
                const nomorInvoice = `INV-${dateStr}-${randomCode}`;

                // Insert header transaksi
                const insertTrx = db.prepare(`
                    INSERT INTO transaksi (
                        nomor_invoice, sesi_shift_id, kasir_id, total_harga, 
                        metode_pembayaran, jumlah_bayar, kembalian, status_transaksi
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'selesai')
                `);

                const trxResult = insertTrx.run(
                    nomorInvoice,
                    sesi_shift_id,
                    kasir_id,
                    totalHarga,
                    metode_pembayaran,
                    bayar,
                    kembalian
                );

                const transaksiId = trxResult.lastInsertRowid;

                // Insert detail transaksi & kurangi stok produk secara atomik
                const insertDetail = db.prepare(`
                    INSERT INTO detail_transaksi (
                        transaksi_id, produk_id, jumlah_beli, harga_satuan, harga_beli_satuan, subtotal
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `);

                const updateStok = db.prepare(`
                    UPDATE produk SET stok = stok - ? WHERE id = ?
                `);

                for (const item of preparedItems) {
                    insertDetail.run(
                        transaksiId,
                        item.produk_id,
                        item.jumlah_beli,
                        item.harga_satuan,
                        item.harga_beli_satuan,
                        item.subtotal
                    );

                    updateStok.run(item.jumlah_beli, item.produk_id);
                }

                return {
                    transaksiId,
                    nomorInvoice,
                    totalHarga,
                    kembalian
                };
            });

            const result = executeTransaction();

            // Ambil data lengkap transaksi hasil simpan dari DB
            const createdTrx = db.prepare(`
                SELECT t.*, u.nama as nama_kasir
                FROM transaksi t
                JOIN users u ON t.kasir_id = u.id
                WHERE t.id = ?
            `).get(result.transaksiId);

            const itemsFromDb = db.prepare(`
                SELECT dt.*, p.nama_barang, p.kode_sku, p.barcode
                FROM detail_transaksi dt
                JOIN produk p ON dt.produk_id = p.id
                WHERE dt.transaksi_id = ?
            `).all(result.transaksiId);

            res.status(201).json({
                success: true,
                message: 'Transaksi berhasil disimpan dan stok produk telah diperbarui',
                data: {
                    ...createdTrx,
                    items: itemsFromDb
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = transactionController;
