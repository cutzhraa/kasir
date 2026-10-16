-- ========================================================
-- Schema DDL SQLite untuk Aplikasi POS (Kasir Berbasis Shift)
-- ========================================================

PRAGMA foreign_keys = ON;

-- 1. Tabel Users / Kasir
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'kasir')) DEFAULT 'kasir',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. Tabel Produk
CREATE TABLE IF NOT EXISTS produk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_barang TEXT NOT NULL,
    barcode TEXT UNIQUE,
    kode_sku TEXT NOT NULL UNIQUE,
    harga_beli NUMERIC NOT NULL DEFAULT 0.00,
    harga_jual NUMERIC NOT NULL DEFAULT 0.00,
    stok INTEGER NOT NULL DEFAULT 0,
    stok_minimum INTEGER NOT NULL DEFAULT 5,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3. Tabel Sesi Shift Kasir
CREATE TABLE IF NOT EXISTS sesi_shift (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    waktu_mulai TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    waktu_selesai TEXT NULL,
    status_sesi TEXT NOT NULL CHECK (status_sesi IN ('aktif', 'selesai')) DEFAULT 'aktif',
    modal_awal NUMERIC NOT NULL DEFAULT 0.00,
    kas_aktual_akhir NUMERIC NULL,
    selisih_kas NUMERIC NULL,
    catatan_shift TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- 4. Tabel Transaksi (Header Penjualan)
CREATE TABLE IF NOT EXISTS transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_invoice TEXT NOT NULL UNIQUE,
    sesi_shift_id INTEGER NOT NULL,
    kasir_id INTEGER NOT NULL,
    waktu_transaksi TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    total_harga NUMERIC NOT NULL DEFAULT 0.00,
    metode_pembayaran TEXT NOT NULL CHECK (metode_pembayaran IN ('tunai', 'qris', 'debit', 'kredit', 'transfer')) DEFAULT 'tunai',
    jumlah_bayar NUMERIC NOT NULL DEFAULT 0.00,
    kembalian NUMERIC NOT NULL DEFAULT 0.00,
    status_transaksi TEXT NOT NULL CHECK (status_transaksi IN ('selesai', 'batal')) DEFAULT 'selesai',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sesi_shift_id) REFERENCES sesi_shift(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (kasir_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- 5. Tabel Detail Transaksi (Item Barang Penjualan)
CREATE TABLE IF NOT EXISTS detail_transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaksi_id INTEGER NOT NULL,
    produk_id INTEGER NOT NULL,
    jumlah_beli INTEGER NOT NULL,
    harga_satuan NUMERIC NOT NULL,
    harga_beli_satuan NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (produk_id) REFERENCES produk(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Indexes untuk optimasi pencarian barcode, invoice, shift, dan audit
CREATE INDEX IF NOT EXISTS idx_produk_barcode ON produk(barcode);
CREATE INDEX IF NOT EXISTS idx_produk_sku ON produk(kode_sku);
CREATE INDEX IF NOT EXISTS idx_shift_status ON sesi_shift(status_sesi);
CREATE INDEX IF NOT EXISTS idx_shift_user ON sesi_shift(user_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_shift ON transaksi(sesi_shift_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_waktu ON transaksi(waktu_transaksi);
CREATE INDEX IF NOT EXISTS idx_transaksi_metode ON transaksi(metode_pembayaran);
CREATE INDEX IF NOT EXISTS idx_detail_transaksi ON detail_transaksi(transaksi_id);
CREATE INDEX IF NOT EXISTS idx_detail_produk ON detail_transaksi(produk_id);

