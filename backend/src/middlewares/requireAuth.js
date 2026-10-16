const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Silakan login kembali' });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(500).json({ success: false, message: 'JWT_SECRET belum dikonfigurasi dengan aman' });
    }

    try {
        req.auth = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Sesi login kedaluwarsa, silakan login kembali' });
    }
}

module.exports = requireAuth;
