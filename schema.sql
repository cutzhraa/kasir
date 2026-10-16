-- ========================================================
-- Perancangan Database Relasional Sistem POS Berbasis Shift
-- Database: MySQL / MariaDB (Engine: InnoDB)
-- ========================================================

-- 1. Tabel Users / Kasir
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- Disarankan menyimpan hash (e.g. bcrypt/argon2)
    role ENUM('admin', 'kasir') NOT NULL DEFAULT 'kasir',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Produk
CREATE TABLE IF NOT EXISTS produk (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nama_barang VARCHAR(150) NOT NULL,
    barcode VARCHAR(64) UNIQUE,
    kode_sku VARCHAR(64) NOT NULL UNIQUE,
    harga_beli DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    harga_jual DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    stok INT NOT NULL DEFAULT 0,
    stok_minimum INT NOT NULL DEFAULT 5,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_produk_barcode (barcode),
    INDEX idx_produk_sku (kode_sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Sesi Shift Kasir
CREATE TABLE IF NOT EXISTS sesi_shift (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    waktu_mulai DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    waktu_selesai DATETIME NULL,
    status_sesi ENUM('aktif', 'selesai') NOT NULL DEFAULT 'aktif',
    modal_awal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    kas_aktual_akhir DECIMAL(15, 2) NULL, -- Diisi kasir saat tutup shift (uang fisik di laci)
    selisih_kas DECIMAL(15, 2) NULL,      -- kas_aktual_akhir - (modal_awal + total_tunai)
    catatan_shift TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_shift_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
        
    INDEX idx_shift_status (status_sesi),
    INDEX idx_shift_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Transaksi (Penjualan / Header)
CREATE TABLE IF NOT EXISTS transaksi (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nomor_invoice VARCHAR(50) NOT NULL UNIQUE,
    sesi_shift_id BIGINT NOT NULL,
    kasir_id INT NOT NULL,
    waktu_transaksi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_harga DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    metode_pembayaran ENUM('tunai', 'qris', 'debit', 'kredit', 'transfer') NOT NULL DEFAULT 'tunai',
    jumlah_bayar DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    kembalian DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status_transaksi ENUM('selesai', 'batal') NOT NULL DEFAULT 'selesai',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_transaksi_shift 
        FOREIGN KEY (sesi_shift_id) REFERENCES sesi_shift(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
        
    CONSTRAINT fk_transaksi_kasir 
        FOREIGN KEY (kasir_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
        
    INDEX idx_transaksi_shift (sesi_shift_id),
    INDEX idx_transaksi_waktu (waktu_transaksi),
    INDEX idx_transaksi_metode (metode_pembayaran)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Detail Transaksi (Item Penjualan)
CREATE TABLE IF NOT EXISTS detail_transaksi (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaksi_id BIGINT NOT NULL,
    produk_id BIGINT NOT NULL,
    jumlah_beli INT NOT NULL,
    harga_satuan DECIMAL(15, 2) NOT NULL,       -- Snapshot harga jual saat transaksi
    harga_beli_satuan DECIMAL(15, 2) NOT NULL,  -- Snapshot HPP (HPP audit laba kotor)
    subtotal DECIMAL(15, 2) NOT NULL,           -- jumlah_beli * harga_satuan
    
    CONSTRAINT fk_detail_transaksi 
        FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
        
    CONSTRAINT fk_detail_produk 
        FOREIGN KEY (produk_id) REFERENCES produk(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
        
    INDEX idx_detail_transaksi (transaksi_id),
    INDEX idx_detail_produk (produk_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

