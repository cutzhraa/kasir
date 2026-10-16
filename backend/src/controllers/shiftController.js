const db = require('../config/database');

const shiftController = {
    // Ambil shift aktif milik kasir tertentu
    getActiveShift: (req, res, next) => {
        try {
            const { userId } = req.query;
            const shift = db.prepare(`
                SELECT s.*, u.nama as nama_kasir 
                FROM sesi_shift s
                JOIN users u ON s.user_id = u.id
                WHERE s.user_id = ? AND s.status_sesi = 'aktif'
                ORDER BY s.id DESC LIMIT 1
            `).get(userId);

            res.json({ success: true, data: shift || null });
        } catch (error) {
            next(error);
        }
    },

    // Buka sesi shift baru (input modal awal kasir)
    startShift: (req, res, next) => {
        try {
            const userId = req.body.user_id || req.body.kasir_id;
            const modalAwal = req.body.modal_awal !== undefined ? req.body.modal_awal : 0;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'user_id (atau kasir_id) wajib diisi'
                });
            }

            // Validasi: Cegah membuka shift ganda jika masih ada shift aktif
            const activeShift = db.prepare(`
                SELECT id FROM sesi_shift 
                WHERE user_id = ? AND status_sesi = 'aktif'
            `).get(userId);

            if (activeShift) {
                return res.status(400).json({
                    success: false,
                    message: 'Kasir masih memiliki sesi shift yang aktif (ID: ' + activeShift.id + ')'
                });
            }

            const stmt = db.prepare(`
                INSERT INTO sesi_shift (user_id, modal_awal, status_sesi)
                VALUES (?, ?, 'aktif')
            `);

            const result = stmt.run(userId, Number(modalAwal));
            const newShift = db.prepare('SELECT * FROM sesi_shift WHERE id = ?').get(result.lastInsertRowid);

            res.status(201).json({
                success: true,
                message: 'Shift kasir berhasil dibuka',
                data: newShift
            });
        } catch (error) {
            next(error);
        }
    },

    // Tutup sesi shift kasir & audit selisih kas (Blind Count)
    closeShift: (req, res, next) => {
        try {
            const { id } = req.params;
            const { kas_aktual_akhir, catatan_shift } = req.body;

            if (kas_aktual_akhir === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Kas aktual akhir (hitungan fisik uang di laci) wajib diisi'
                });
            }

            const shift = db.prepare('SELECT * FROM sesi_shift WHERE id = ?').get(id);
            if (!shift) {
                return res.status(404).json({ success: false, message: 'Shift tidak ditemukan' });
            }

            if (shift.status_sesi === 'selesai') {
                return res.status(400).json({ success: false, message: 'Shift ini sudah pernah ditutup' });
            }

            // Hitung total penjualan tunai pada shift ini
            const cashSales = db.prepare(`
                SELECT COALESCE(SUM(total_harga), 0) AS total_tunai
                FROM transaksi
                WHERE sesi_shift_id = ? AND metode_pembayaran = 'tunai' AND status_transaksi = 'selesai'
            `).get(id);

            const totalTunai = Number(cashSales.total_tunai);
            const kasDiharapkan = Number(shift.modal_awal) + totalTunai;
            const kasAktual = Number(kas_aktual_akhir);
            const selisih = kasAktual - kasDiharapkan; // negatif = minus/hilang, positif = lebih

            // Update sesi shift
            const updateStmt = db.prepare(`
                UPDATE sesi_shift 
                SET waktu_selesai = datetime('now', 'localtime'),
                    status_sesi = 'selesai',
                    kas_aktual_akhir = ?,
                    selisih_kas = ?,
                    catatan_shift = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `);

            updateStmt.run(kasAktual, selisih, catatan_shift || null, id);

            const closedShift = db.prepare('SELECT * FROM sesi_shift WHERE id = ?').get(id);

            res.json({
                success: true,
                message: 'Shift berhasil ditutup dan diaudit',
                data: {
                    ...closedShift,
                    modal_awal: Number(shift.modal_awal),
                    total_penjualan_tunai: totalTunai,
                    kas_diharapkan: kasDiharapkan,
                    kas_aktual_akhir: kasAktual,
                    selisih_kas: selisih
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // Rekapitulasi audit shift
    getShiftSummary: (req, res, next) => {
        try {
            const { id } = req.params;
            const shift = db.prepare(`
                SELECT s.*, u.nama as nama_kasir, u.username
                FROM sesi_shift s
                JOIN users u ON s.user_id = u.id
                WHERE s.id = ?
            `).get(id);

            if (!shift) {
                return res.status(404).json({ success: false, message: 'Shift tidak ditemukan' });
            }

            // Total penjualan tunai pada shift ini
            const cashSales = db.prepare(`
                SELECT COALESCE(SUM(total_harga), 0) AS total_tunai, COUNT(*) as count_tunai
                FROM transaksi
                WHERE sesi_shift_id = ? AND metode_pembayaran = 'tunai' AND status_transaksi = 'selesai'
            `).get(id);

            // Total penjualan non-tunai (QRIS, Debit, Kredit, Transfer)
            const nonCashSales = db.prepare(`
                SELECT COALESCE(SUM(total_harga), 0) AS total_non_tunai, COUNT(*) as count_non_tunai
                FROM transaksi
                WHERE sesi_shift_id = ? AND metode_pembayaran != 'tunai' AND status_transaksi = 'selesai'
            `).get(id);

            // Total per metode pembayaran
            const paymentBreakdown = db.prepare(`
                SELECT metode_pembayaran, COUNT(*) as jumlah_transaksi, COALESCE(SUM(total_harga), 0) as total_nominal
                FROM transaksi
                WHERE sesi_shift_id = ? AND status_transaksi = 'selesai'
                GROUP BY metode_pembayaran
            `).all(id);

            // Ringkasan item terjual
            const itemSummary = db.prepare(`
                SELECT dt.produk_id, p.nama_barang, SUM(dt.jumlah_beli) as total_qty, SUM(dt.subtotal) as total_omzet
                FROM detail_transaksi dt
                JOIN transaksi t ON dt.transaksi_id = t.id
                JOIN produk p ON dt.produk_id = p.id
                WHERE t.sesi_shift_id = ? AND t.status_transaksi = 'selesai'
                GROUP BY dt.produk_id
            `).all(id);

            const modalAwal = Number(shift.modal_awal);
            const totalTunai = Number(cashSales.total_tunai);
            const totalNonTunai = Number(nonCashSales.total_non_tunai);
            const kasDiharapkan = modalAwal + totalTunai;

            res.json({
                success: true,
                data: {
                    shift,
                    modal_awal: modalAwal,
                    total_tunai: totalTunai,
                    count_tunai: Number(cashSales.count_tunai),
                    total_non_tunai: totalNonTunai,
                    count_non_tunai: Number(nonCashSales.count_non_tunai),
                    total_omzet: totalTunai + totalNonTunai,
                    count_total: Number(cashSales.count_tunai) + Number(nonCashSales.count_non_tunai),
                    kas_diharapkan: kasDiharapkan,
                    paymentBreakdown,
                    itemSummary
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = shiftController;

