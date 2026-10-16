# Sistem Aplikasi Kasir (POS) Berbasis Shift

Aplikasi Point of Sale (POS) dengan audit sesi shift kasir untuk pencegahan selisih uang dan kecurangan kasir.

## 📁 Struktur Folder Proyek

```text
kasir/
├── backend/
│   ├── data/
│   │   └── kasir.db                   # File database SQLite (otomatis dibuat)
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js            # Koneksi better-sqlite3 (WAL mode & FK On)
│   │   ├── controllers/
│   │   │   ├── authController.js      # Login kasir/admin
│   │   │   ├── productController.js   # Manajemen produk & pencarian barcode
│   │   │   ├── shiftController.js     # Buka shift, hitung modal, tutup shift & audit selisih
│   │   │   └── transactionController.js # Checkout transaksi atomic, potong stok & snapshot HPP
│   │   ├── database/
│   │   │   ├── schema.sqlite.sql      # DDL Skema SQLite
│   │   │   └── initDb.js              # Script inisialisasi tabel & seeder default
│   │   ├── middlewares/
│   │   │   └── errorHandler.js        # Global error handler
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── productRoutes.js
│   │   │   ├── shiftRoutes.js
│   │   │   └── transactionRoutes.js
│   │   ├── app.js                     # Inisialisasi Express & routing
│   │   └── server.js                  # Entry point server HTTP
│   ├── .env                           # Konfigurasi environment backend
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/                # Komponen UI modular
│   │   ├── context/                   # Context autentikasi & shift kasir
│   │   ├── hooks/                     # Custom React hooks
│   │   ├── pages/                     # Halaman POS kasir, tutup shift, produk
│   │   ├── services/
│   │   │   └── api.js                 # API service client untuk memanggil backend
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── schema.sql                         # Referensi skema MySQL / MariaDB awal
└── README.md
```

## 🚀 Cara Menjalankan

### 1. Backend (Node.js + Express + SQLite)
Masuk ke folder `backend`:
```bash
cd backend
npm install
npm run db:init   # Inisialisasi tabel SQLite & data awal
npm run dev       # Menjalankan server pada mode development (port 5000)
```

**Akun Default Hasil Seeder:**
- **Admin**: Username: `admin`, Password: `admin123`
- **Kasir**: Username: `kasir1`, Password: `kasir123`

### 2. Frontend (React + Vite)
Masuk ke folder `frontend`:
```bash
cd frontend
npm install
npm run dev       # Menjalankan aplikasi React Vite (port 5173)
```

## Deploy untuk uji coba online

Backend dan frontend harus di-deploy terpisah. SQLite memerlukan persistent disk; jangan gunakan filesystem sementara untuk data POS.

### Backend di Render

1. Buat **Web Service** dari repo `cutzhraa/kasir`, dengan **Root Directory** `backend`.
2. Isi **Build Command** `npm install`, **Start Command** `npm start`, dan **Health Check Path** `/api/health`.
3. Tambahkan persistent disk yang tersedia pada plan service, dengan **Mount Path** `/var/data`.
4. Atur environment variables:
   - `NODE_ENV=production`
   - `DB_PATH=/var/data/kasir.db`
   - `JWT_SECRET` dengan secret acak yang panjang dan unik
   - `CORS_ORIGINS` dengan domain frontend Vercel, misalnya `https://kasir-example.vercel.app`
   - Jangan isi `PORT`; Render menyediakannya.
5. Setelah deploy, buka `https://<nama-service>.onrender.com/api/health` dan pastikan respons menunjukkan status `OK`.

### Frontend di Vercel

Di **Project Settings → Environment Variables**, tambahkan `VITE_API_BASE_URL` dengan nilai `https://<nama-service>.onrender.com/api`, lalu redeploy frontend.

> **Keamanan:** aplikasi saat ini membuat akun awal `admin/admin123` dan `kasir1/kasir123`. Jangan gunakan untuk transaksi atau data sungguhan sebelum kredensial default dan proteksi API diperbaiki. Deploy ini sebaiknya dipakai untuk uji coba terlebih dahulu.
