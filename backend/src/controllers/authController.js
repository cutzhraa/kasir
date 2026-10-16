const bcrypt = require('bcryptjs');
const db = require('../config/database');

const authController = {
    login: (req, res, next) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username dan password wajib diisi'
                });
            }

            const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Username atau password salah'
                });
            }

            const isMatch = bcrypt.compareSync(password, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Username atau password salah'
                });
            }

            // Cek apakah user sedang memiliki shift aktif
            const activeShift = db.prepare(`
                SELECT * FROM sesi_shift 
                WHERE user_id = ? AND status_sesi = 'aktif'
                ORDER BY id DESC LIMIT 1
            `).get(user.id);

            // Sanitasi data user (jangan kirim hash password)
            const userData = {
                id: user.id,
                nama: user.nama,
                username: user.username,
                role: user.role
            };

            res.json({
                success: true,
                message: 'Login berhasil',
                data: {
                    user: userData,
                    activeShift: activeShift || null
                }
            });
        } catch (error) {
            next(error);
        }
    },

    getUsers: (req, res, next) => {
        try {
            const users = db.prepare('SELECT id, nama, username, role, is_active, created_at FROM users').all();
            res.json({ success: true, data: users });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = authController;

