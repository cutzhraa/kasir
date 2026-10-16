const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

function initDatabase() {
    console.log('🔄 Memulai inisialisasi database SQLite...');

    try {
        // 1. Eksekusi skema DDL
        const schemaPath = path.resolve(__dirname, 'schema.sqlite.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql);
        console.log('✅ Skema tabel berhasil dibuat/diverifikasi.');

        // 2. Seed User Default (jika belum ada)
        const checkUser = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (checkUser.count === 0) {
            console.log('🌱 Menambahkan akun pengguna default...');
            const insertUser = db.prepare(`
                INSERT INTO users (nama, username, password, role) 
                VALUES (?, ?, ?, ?)
            `);

            const salt = bcrypt.genSaltSync(10);
            const adminPasswordHash = bcrypt.hashSync('admin123', salt);
            const kasirPasswordHash = bcrypt.hashSync('kasir123', salt);

            const seedUsers = db.transaction(() => {
                insertUser.run('Super Admin', 'admin', adminPasswordHash, 'admin');
                insertUser.run('Kasir Utama', 'kasir1', kasirPasswordHash, 'kasir');
            });
            seedUsers();

            console.log('✅ User default dibuat:');
            console.log('   - Admin: username "admin", password "admin123"');
            console.log('   - Kasir: username "kasir1", password "kasir123"');
        }

        // 3. Seed Produk Contoh (jika belum ada)
        const checkProduct = db.prepare('SELECT COUNT(*) as count FROM produk').get();
        if (checkProduct.count === 0) {
            console.log('🌱 Menambahkan sampel produk...');
            const insertProduct = db.prepare(`
                INSERT INTO produk (nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const sampleProducts = [
                ['Kopi Susu Gula Aren 250ml', '899100100001', 'SKU-KOP-001', 10000, 18000, 50, 10],
                ['Roti Bakar Cokelat Keju', '899100100002', 'SKU-ROT-002', 8000, 15000, 30, 5],
                ['Air Mineral 600ml', '899100100003', 'SKU-AIR-003', 2500, 5000, 100, 20],
                ['Keripik Singkong Balado', '899100100004', 'SKU-KRP-004', 6000, 12000, 40, 10],
                ['Teh Botol Melati 350ml', '899100100005', 'SKU-TEH-005', 3000, 6000, 75, 15]
            ];

            const seedProducts = db.transaction(() => {
                for (const prod of sampleProducts) {
                    insertProduct.run(...prod);
                }
            });
            seedProducts();

            console.log(`✅ ${sampleProducts.length} sampel produk berhasil ditambahkan.`);
        }

        console.log('🎉 Inisialisasi database selesai! Siap digunakan.');
    } catch (err) {
        console.error('❌ Gagal menginisialisasi database:', err.message);
        process.exit(1);
    }
}

// Jalankan langsung jika dipanggil dari CLI
if (require.main === module) {
    initDatabase();
}

module.exports = initDatabase;

