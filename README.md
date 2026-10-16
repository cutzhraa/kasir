# Sistem Aplikasi Kasir (POS) Berbasis Shift

Aplikasi Point of Sale (POS) dengan audit sesi shift kasir. Frontend menggunakan React/Vite, API Express, dan database PostgreSQL Supabase.

## Struktur Proyek

```text
kasir/
├── backend/
│   ├── src/
│   │   ├── config/database.js       # Pool koneksi PostgreSQL
│   │   ├── controllers/
│   │   ├── database/
│   │   │   ├── schema.postgres.sql  # Skema PostgreSQL
│   │   │   └── initDb.js            # Inisialisasi dan seed akun
│   │   ├── routes/
│   │   ├── app.js                   # Express app, dideteksi Vercel otomatis
│   │   └── server.js                # Server development lokal
│   └── package.json
├── frontend/
│   ├── src/
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Jalankan secara lokal

1. Buat `backend/.env` dari `.env.example` dan isi `DATABASE_URL` dengan Supabase Transaction Pooler URL.
2. Inisialisasi database dan akun development:

   ```powershell
   cd backend
   npm install
   npm run db:init
   npm run dev
   ```

   Seeder development membuat admin `admin/admin123` dan kasir `kasir1/kasir123`; gunakan hanya untuk data lokal.
3. Jalankan frontend di terminal lain:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

## Deploy gratis untuk uji coba online

Frontend dan API di-deploy sebagai dua project Vercel; PostgreSQL menggunakan Supabase. Paket gratis memiliki kuota dan batas penggunaan, dan Supabase dapat melakukan pause pada project yang lama tidak aktif.

### 1. Siapkan Supabase

1. Buat project di Supabase.
2. Ambil **Transaction Pooler connection string** dari **Project Settings → Database → Connection string**. Gunakan URL pooler (biasanya port `6543`) dan simpan password database dengan aman.
3. Dari PowerShell, jalankan inisialisasi schema dan akun awal. Ganti placeholder dengan nilai sendiri; jangan commit URL/password:

   ```powershell
   cd backend
   $env:DATABASE_URL = "PASTE_SUPABASE_TRANSACTION_POOLER_URL"
   $env:NODE_ENV = "production"
   $env:INITIAL_ADMIN_PASSWORD = "PASSWORD_ACAK_ADMIN_MINIMAL_12_KARAKTER"
   $env:INITIAL_CASHIER_PASSWORD = "PASSWORD_ACAK_KASIR_MINIMAL_12_KARAKTER"
   npm install
   npm run db:init
   ```

   Command membuat tabel dan dua akun pertama jika tabel `users` masih kosong. Username bisa diubah melalui `INITIAL_ADMIN_USERNAME` dan `INITIAL_CASHIER_USERNAME`.

### 2. Deploy API ke Vercel

1. Di Vercel, buat **New Project** dari repo `cutzhraa/kasir` yang sama. Ini project kedua—biarkan project frontend terpisah.
2. Pilih **Root Directory** `backend`.
3. Biarkan Vercel mendeteksi framework **Express** otomatis; jangan isi Build Command atau Output Directory kustom.
4. Atur Environment Variables:
   - `DATABASE_URL`: Supabase Transaction Pooler connection string.
   - `NODE_ENV`: `production`.
   - `JWT_SECRET`: string acak rahasia minimal 32 karakter (buat nilai terpisah dari password database).
   - `CORS_ORIGINS`: URL frontend Vercel tanpa garis miring di akhir, misalnya `https://kasir.vercel.app`.
5. Deploy, lalu buka `https://<api-project>.vercel.app/api/health`. Respons `OK` berarti API berhasil terhubung ke database.

### 3. Hubungkan frontend Vercel

Pada project frontend yang sudah dibuat, buka **Settings → Environment Variables**, tambahkan:

```text
VITE_API_BASE_URL=https://<api-project>.vercel.app/api
```

Lalu lakukan **Redeploy** frontend.

> Ini menggunakan database Supabase baru; data SQLite lokal tidak otomatis disalin. Route operasional memerlukan login, token kedaluwarsa otomatis, dan data shift/transaksi dibatasi per kasir (admin dapat melihat seluruhnya). Gunakan hanya untuk pengujian dengan data dummy sampai proses otorisasi dan pengelolaan akun ditinjau sebelum pemakaian produksi.

### Pencarian nama produk lewat barcode

Jika barcode belum terdaftar di katalog toko, aplikasi mencoba mencari nama produk dan kuantitas di [Open Food Facts](https://world.openfoodfacts.org/). Hasilnya hanya saran untuk membantu pengisian nama; kasir tetap perlu memeriksa data dan mengisi harga serta stok toko. Jika produk tidak ditemukan atau layanan tidak tersedia, produk masih bisa didaftarkan secara manual. Katalog ini terutama mencakup produk makanan/minuman, sehingga tidak semua barcode tersedia. Ikuti [ketentuan penggunaan API Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/) dan lengkapi formulir penggunaan API mereka sebelum pemakaian rutin.
