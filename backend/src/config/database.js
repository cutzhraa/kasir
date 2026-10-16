const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Lokasi file database SQLite
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/kasir.db');

// Pastikan folder data tersedia
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Inisialisasi koneksi SQLite
const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
});

// Konfigurasi performa & integritas referensial
db.pragma('journal_mode = WAL'); // Write-Ahead Logging untuk konkurensi tinggi
db.pragma('foreign_keys = ON');   // Wajib aktif untuk integritas relasi foreign key
db.pragma('synchronous = NORMAL');

module.exports = db;

