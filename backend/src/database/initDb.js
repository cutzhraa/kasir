require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../config/database');

async function initDatabase() {
    const schemaPath = path.resolve(__dirname, 'schema.postgres.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await withTransaction(async (client) => {
        await client.query(schemaSql);

        const { rows: [userCount] } = await client.query('SELECT COUNT(*)::integer AS count FROM users');
        if (userCount.count === 0) {
            const isProduction = process.env.NODE_ENV === 'production';
            const accounts = isProduction
                ? [
                    {
                        nama: process.env.INITIAL_ADMIN_NAME || 'Super Admin',
                        username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
                        password: process.env.INITIAL_ADMIN_PASSWORD,
                        role: 'admin'
                    },
                    {
                        nama: process.env.INITIAL_CASHIER_NAME || 'Kasir Utama',
                        username: process.env.INITIAL_CASHIER_USERNAME || 'kasir1',
                        password: process.env.INITIAL_CASHIER_PASSWORD,
                        role: 'kasir'
                    }
                ]
                : [
                    { nama: 'Super Admin', username: 'admin', password: 'admin123', role: 'admin' },
                    { nama: 'Kasir Utama', username: 'kasir1', password: 'kasir123', role: 'kasir' }
                ];

            if (accounts.some((account) => !account.password || (isProduction && account.password.length < 12))) {
                throw new Error('Di production, password awal admin dan kasir wajib minimal 12 karakter');
            }

            for (const account of accounts) {
                await client.query(`
                    INSERT INTO users (nama, username, password, role)
                    VALUES ($1, $2, $3, $4)
                `, [
                    account.nama,
                    account.username,
                    await bcrypt.hash(account.password, 12),
                    account.role
                ]);
            }
        }

        if (process.env.SEED_SAMPLE_PRODUCTS === 'true') {
            const { rows: [productCount] } = await client.query('SELECT COUNT(*)::integer AS count FROM produk');
            if (productCount.count === 0) {
                const sampleProducts = [
                    ['Kopi Susu Gula Aren 250ml', '899100100001', 'SKU-KOP-001', 10000, 18000, 50, 10],
                    ['Roti Bakar Cokelat Keju', '899100100002', 'SKU-ROT-002', 8000, 15000, 30, 5],
                    ['Air Mineral 600ml', '899100100003', 'SKU-AIR-003', 2500, 5000, 100, 20],
                    ['Keripik Singkong Balado', '899100100004', 'SKU-KRP-004', 6000, 12000, 40, 10],
                    ['Teh Botol Melati 350ml', '899100100005', 'SKU-TEH-005', 3000, 6000, 75, 15]
                ];

                for (const product of sampleProducts) {
                    await client.query(`
                        INSERT INTO produk (
                            nama_barang, barcode, kode_sku, harga_beli, harga_jual, stok, stok_minimum
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, product);
                }
            }
        }
    });

    console.log('Database Supabase berhasil disiapkan.');
}

if (require.main === module) {
    initDatabase()
        .catch((error) => {
            console.error('Gagal menyiapkan database:', error);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}

module.exports = initDatabase;
