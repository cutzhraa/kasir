const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authController = {
    login: async (req, res, next) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username dan password wajib diisi'
                });
            }
            if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
                return res.status(500).json({
                    success: false,
                    message: 'JWT_SECRET belum dikonfigurasi dengan aman'
                });
            }

            const { rows: [user] } = await pool.query(
                'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
                [username]
            );
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({
                    success: false,
                    message: 'Username atau password salah'
                });
            }

            const { rows: [activeShift] } = await pool.query(`
                SELECT * FROM sesi_shift
                WHERE user_id = $1 AND status_sesi = 'aktif'
                ORDER BY id DESC LIMIT 1
            `, [user.id]);

            res.json({
                success: true,
                message: 'Login berhasil',
                data: {
                    user: {
                        id: user.id,
                        nama: user.nama,
                        username: user.username,
                        role: user.role
                    },
                    token: jwt.sign(
                        { id: user.id, username: user.username, role: user.role },
                        process.env.JWT_SECRET,
                        { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
                    ),
                    activeShift: activeShift || null
                }
            });
        } catch (error) {
            next(error);
        }
    },

    getUsers: async (req, res, next) => {
        try {
            const { rows } = await pool.query(
                'SELECT id, nama, username, role, is_active, created_at FROM users ORDER BY id'
            );
            res.json({ success: true, data: rows });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = authController;
