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

