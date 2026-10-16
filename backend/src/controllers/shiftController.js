const { pool, withTransaction } = require('../config/database');

const shiftController = {
    getActiveShift: async (req, res, next) => {
        try {
            const userId = req.auth.id;
            const { rows: [shift] } = await pool.query(`
                SELECT s.*, u.nama AS nama_kasir
                FROM sesi_shift s
                JOIN users u ON s.user_id = u.id
                WHERE s.user_id = $1 AND s.status_sesi = 'aktif'
                ORDER BY s.id DESC LIMIT 1
            `, [userId]);
            res.json({ success: true, data: shift || null });
        } catch (error) {
            next(error);
        }
    },

    startShift: async (req, res, next) => {
        try {
            const userId = req.auth.id;
            const modalAwal = req.body.modal_awal !== undefined ? req.body.modal_awal : 0;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'user_id (atau kasir_id) wajib diisi'
                });
            }

            const { rows: [newShift] } = await pool.query(`
                INSERT INTO sesi_shift (user_id, modal_awal, status_sesi)
                VALUES ($1, $2, 'aktif')
                RETURNING *
            `, [userId, Number(modalAwal)]);

            res.status(201).json({
                success: true,
                message: 'Shift kasir berhasil dibuka',
                data: newShift
            });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({
                    success: false,
                    message: 'Kasir masih memiliki sesi shift yang aktif'
                });
            }
            next(error);
        }
    },

    closeShift: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { kas_aktual_akhir, catatan_shift } = req.body;

            if (kas_aktual_akhir === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Kas aktual akhir (hitungan fisik uang di laci) wajib diisi'
                });
            }

            const result = await withTransaction(async (client) => {
                const { rows: [shift] } = await client.query(
                    'SELECT * FROM sesi_shift WHERE id = $1 FOR UPDATE',
                    [id]
                );
                if (!shift) return { error: 'not_found' };
                if (req.auth.role !== 'admin' && shift.user_id !== req.auth.id) {
                    return { error: 'not_found' };
                }
                if (shift.status_sesi === 'selesai') return { error: 'already_closed' };

                const { rows: [cashSales] } = await client.query(`
                    SELECT COALESCE(SUM(total_harga), 0) AS total_tunai
                    FROM transaksi
                    WHERE sesi_shift_id = $1 AND metode_pembayaran = 'tunai' AND status_transaksi = 'selesai'
                `, [id]);
                const totalTunai = Number(cashSales.total_tunai);
                const kasDiharapkan = Number(shift.modal_awal) + totalTunai;
                const kasAktual = Number(kas_aktual_akhir);
                const selisih = kasAktual - kasDiharapkan;

                const { rows: [closedShift] } = await client.query(`
                    UPDATE sesi_shift
                    SET waktu_selesai = NOW(),
                        status_sesi = 'selesai',
                        kas_aktual_akhir = $1,
                        selisih_kas = $2,
                        catatan_shift = $3,
                        updated_at = NOW()
                    WHERE id = $4
                    RETURNING *
                `, [kasAktual, selisih, catatan_shift || null, id]);

                return { closedShift, shift, totalTunai, kasDiharapkan, kasAktual, selisih };
            });

            if (result.error === 'not_found') {
                return res.status(404).json({ success: false, message: 'Shift tidak ditemukan' });
            }
            if (result.error === 'already_closed') {
                return res.status(400).json({ success: false, message: 'Shift ini sudah pernah ditutup' });
            }

            res.json({
                success: true,
                message: 'Shift berhasil ditutup dan diaudit',
                data: {
                    ...result.closedShift,
                    modal_awal: Number(result.shift.modal_awal),
                    total_penjualan_tunai: result.totalTunai,
                    kas_diharapkan: result.kasDiharapkan,
                    kas_aktual_akhir: result.kasAktual,
                    selisih_kas: result.selisih
                }
            });
        } catch (error) {
            next(error);
        }
    },

    getShiftSummary: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { rows: [shift] } = await pool.query(`
                SELECT s.*, u.nama AS nama_kasir, u.username
                FROM sesi_shift s
                JOIN users u ON s.user_id = u.id
                WHERE s.id = $1 AND ($3 = 'admin' OR s.user_id = $2)
            `, [id, req.auth.id, req.auth.role]);

            if (!shift) {
                return res.status(404).json({ success: false, message: 'Shift tidak ditemukan' });
            }

            const [cashResult, nonCashResult, paymentResult, itemResult] = await Promise.all([
                pool.query(`
                    SELECT COALESCE(SUM(total_harga), 0) AS total_tunai, COUNT(*) AS count_tunai
                    FROM transaksi
                    WHERE sesi_shift_id = $1 AND metode_pembayaran = 'tunai' AND status_transaksi = 'selesai'
                `, [id]),
                pool.query(`
                    SELECT COALESCE(SUM(total_harga), 0) AS total_non_tunai, COUNT(*) AS count_non_tunai
                    FROM transaksi
                    WHERE sesi_shift_id = $1 AND metode_pembayaran <> 'tunai' AND status_transaksi = 'selesai'
                `, [id]),
                pool.query(`
                    SELECT metode_pembayaran, COUNT(*) AS jumlah_transaksi, COALESCE(SUM(total_harga), 0) AS total_nominal
                    FROM transaksi
                    WHERE sesi_shift_id = $1 AND status_transaksi = 'selesai'
                    GROUP BY metode_pembayaran
                `, [id]),
                pool.query(`
                    SELECT dt.produk_id, p.nama_barang, SUM(dt.jumlah_beli) AS total_qty,
                           SUM(dt.subtotal) AS total_omzet
                    FROM detail_transaksi dt
                    JOIN transaksi t ON dt.transaksi_id = t.id
                    JOIN produk p ON dt.produk_id = p.id
                    WHERE t.sesi_shift_id = $1 AND t.status_transaksi = 'selesai'
                    GROUP BY dt.produk_id, p.nama_barang
                `, [id])
            ]);

            const cashSales = cashResult.rows[0];
            const nonCashSales = nonCashResult.rows[0];
            const modalAwal = Number(shift.modal_awal);
            const totalTunai = Number(cashSales.total_tunai);
            const totalNonTunai = Number(nonCashSales.total_non_tunai);
            const countTunai = Number(cashSales.count_tunai);
            const countNonTunai = Number(nonCashSales.count_non_tunai);

            res.json({
                success: true,
                data: {
                    shift,
                    modal_awal: modalAwal,
                    total_tunai: totalTunai,
                    count_tunai: countTunai,
                    total_non_tunai: totalNonTunai,
                    count_non_tunai: countNonTunai,
                    total_omzet: totalTunai + totalNonTunai,
                    count_total: countTunai + countNonTunai,
                    kas_diharapkan: modalAwal + totalTunai,
                    paymentBreakdown: paymentResult.rows,
                    itemSummary: itemResult.rows
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = shiftController;
