import { useState, useEffect } from 'react';
import api from './services/api';
import BarcodeScannerModal from './components/BarcodeScannerModal';
import './App.css';

// Helper format mata uang Rupiah
const formatRupiah = (number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number || 0);
};

// Helper audio beep scanner register
const playBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1300, ctx.currentTime);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore audio error
  }
};

export default function App() {
  // 1. State Autentikasi & Kasir
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginForm, setLoginForm] = useState({ username: 'kasir1', password: 'kasir123' });
  const [availableUsers, setAvailableUsers] = useState([]);

  // 2. State Sesi Shift
  const [activeShift, setActiveShift] = useState(null);
  const [shiftSummary, setShiftSummary] = useState(null);
  const [modalAwalInput, setModalAwalInput] = useState('150000');
  const [kasAktualInput, setKasAktualInput] = useState('');
  const [catatanShiftInput, setCatatanShiftInput] = useState('');

  // 3. State Data Katalog & Transaksi
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  // 4. State Modal
  const [showShiftModal, setShowShiftModal] = useState(false); // Modal Buka Shift (Clock-In)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false); // Modal Tutup Shift (Clock-Out)
  const [showCloseResultModal, setShowCloseResultModal] = useState(false); // Hasil Audit Tutup Shift
  const [closedShiftResult, setClosedShiftResult] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);

  // 5. State Scanner Barcode Kamera & Quick Add
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    barcode: '',
    nama_barang: '',
    kode_sku: '',
    harga_beli: '',
    harga_jual: '',
    stok: '50',
    stok_minimum: '5'
  });

  // 6. Form Transaksi POS
  const [paymentMethod, setPaymentMethod] = useState('tunai');
  const [cashGiven, setCashGiven] = useState('');

  // Form Tambah Produk Baru Biasa
  const [newProduct, setNewProduct] = useState({
    nama_barang: '',
    barcode: '',
    kode_sku: '',
    harga_beli: '',
    harga_jual: '',
    stok: '50',
    stok_minimum: '5'
  });

  const [notification, setNotification] = useState({ message: '', type: '' });

  const showNotify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 4500);
  };

  // Muat Daftar User untuk Halaman Login
  const loadUsers = async () => {
    try {
      const res = await api.auth.getUsers();
      if (res.success) {
        setAvailableUsers(res.data);
      }
    } catch (err) {
      console.error('Gagal memuat daftar user:', err);
    }
  };

  // Muat Produk dari Backend
  const loadProducts = async (keyword = '') => {
    try {
      setLoading(true);
      const res = await api.produk.getAll(keyword);
      if (res.success) {
        setProducts(res.data);
      }
    } catch (err) {
      showNotify(err.message || 'Gagal memuat produk dari server', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Muat Riwayat Transaksi Terbaru dari Database
  const loadTransactions = async () => {
    try {
      const res = await api.transaksi.getAll();
      if (res.success) {
        setTransactions(res.data);
      }
    } catch (err) {
      console.error('Gagal memuat riwayat transaksi:', err);
    }
  };

  // Cek Status Shift Aktif Kasir
  const checkActiveShift = async (userId) => {
    try {
      const res = await api.shift.getActive(userId);
      if (res.success && res.data) {
        setActiveShift(res.data);
        setShowShiftModal(false);
      } else {
        setActiveShift(null);
        setShowShiftModal(true);
      }
    } catch (err) {
      console.error('Gagal mengecek shift:', err);
    }
  };

  useEffect(() => {
    loadUsers();
    if (currentUser) {
      checkActiveShift(currentUser.id);
      loadProducts();
      loadTransactions();
    }
  }, [currentUser?.id]);

  // ==========================================
  // HANDLER SCAN BARCODE & QUICK ADD
  // ==========================================
  const handleBarcodeScanned = async (scannedCode) => {
    playBeep();
    setShowScannerModal(false);

    try {
      // 1. Cek keberadaan produk di database
      const res = await api.produk.getByCode(scannedCode);
      if (res.success && res.data) {
        // Barcode sudah terdaftar di database -> Langsung masukkan ke keranjang belanja
        addToCart(res.data);
        showNotify(`✅ Barcode terdeteksi: "${res.data.nama_barang}" (+1 ke keranjang)!`);
      } else {
        // Barcode belum terdaftar -> Buka Popup Quick Add
        const cleanCode = scannedCode.trim();
        const generatedSku = `SKU-${cleanCode.slice(-6) || Date.now().toString().slice(-6)}`;
        setQuickAddForm({
          barcode: cleanCode,
          kode_sku: generatedSku,
          nama_barang: '',
          harga_beli: '',
          harga_jual: '',
          stok: '50',
          stok_minimum: '5'
        });
        setShowQuickAddModal(true);
        showNotify(`Barcode "${cleanCode}" belum terdaftar. Silakan daftarkan produk baru.`, 'info');
      }
    } catch (err) {
      showNotify('Gagal mengecek barcode: ' + err.message, 'error');
    }
  };

  // Submit Quick Add Produk Baru
  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.produk.create({
        ...quickAddForm,
        harga_beli: Number(quickAddForm.harga_beli || 0),
        harga_jual: Number(quickAddForm.harga_jual),
        stok: Number(quickAddForm.stok || 0),
        stok_minimum: Number(quickAddForm.stok_minimum || 5)
      });

      if (res.success && res.data) {
        // Refresh katalog produk
        loadProducts();
        // Langsung masukkan produk baru ini ke keranjang belanja kasir!
        addToCart(res.data);
        setShowQuickAddModal(false);
        showNotify(`🎉 Produk "${res.data.nama_barang}" berhasil didaftarkan dan langsung masuk keranjang!`);
      }
    } catch (err) {
      showNotify(err.message || 'Gagal mendaftarkan produk baru', 'error');
    }
  };

  // ==========================================
  // HANDLER AUTENTIKASI (LOGIN / LOGOUT)
  // ==========================================
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.auth.login(loginForm);
      if (res.success) {
        const user = res.data.user;
        setCurrentUser(user);
        localStorage.setItem('pos_user', JSON.stringify(user));

        if (res.data.activeShift) {
          setActiveShift(res.data.activeShift);
          setShowShiftModal(false);
          showNotify(`Selamat datang, ${user.nama}! Sesi shift #${res.data.activeShift.id} aktif.`);
        } else {
          setActiveShift(null);
          setShowShiftModal(true);
          showNotify(`Login berhasil. Silakan buka sesi shift (masukkan modal awal).`);
        }
      }
    } catch (err) {
      showNotify(err.message || 'Username atau password salah', 'error');
    }
  };

  const handleLogout = () => {
    if (activeShift) {
      if (!window.confirm('Peringatan: Anda masih memiliki shift aktif. Yakin ingin keluar?')) {
        return;
      }
    }
    setCurrentUser(null);
    setActiveShift(null);
    setCart([]);
    localStorage.removeItem('pos_user');
    showNotify('Anda telah keluar dari aplikasi');
  };

  // ==========================================
  // HANDLER MANAJEMEN SHIFT (CLOCK-IN & CLOCK-OUT)
  // ==========================================
  const handleStartShift = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const res = await api.shift.mulai({
        user_id: currentUser.id,
        modal_awal: Number(modalAwalInput || 0)
      });
      if (res.success) {
        setActiveShift(res.data);
        setShowShiftModal(false);
        showNotify(`Shift #${res.data.id} berhasil dibuka dengan Modal: ${formatRupiah(res.data.modal_awal)}`);
      }
    } catch (err) {
      showNotify(err.message, 'error');
    }
  };

  const handleOpenCloseShiftModal = async () => {
    if (!activeShift) return;
    try {
      const res = await api.shift.getSummary(activeShift.id);
      if (res.success) {
        setShiftSummary(res.data);
        setKasAktualInput('');
        setCatatanShiftInput('');
        setShowCloseShiftModal(true);
      }
    } catch (err) {
      showNotify('Gagal memuat rekap shift: ' + err.message, 'error');
    }
  };

  const handleConfirmCloseShift = async (e) => {
    e.preventDefault();
    if (!activeShift) return;

    if (kasAktualInput === '') {
      showNotify('Total uang kas fisik di laci wajib diisi!', 'error');
      return;
    }

    try {
      const res = await api.shift.tutup(activeShift.id, {
        kas_aktual_akhir: Number(kasAktualInput),
        catatan_shift: catatanShiftInput
      });

      if (res.success) {
        setClosedShiftResult(res.data);
        setShowCloseShiftModal(false);
        setShowCloseResultModal(true);
        setActiveShift(null);
        showNotify('Shift berhasil ditutup dan diaudit!');
      }
    } catch (err) {
      showNotify(err.message, 'error');
    }
  };

  // ==========================================
  // HANDLER KERANJANG BELANJA & CHECKOUT
  // ==========================================
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    loadProducts(val);
  };

  const addToCart = (product) => {
    if (product.stok <= 0) {
      showNotify(`Stok ${product.nama_barang} habis!`, 'error');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stok) {
          showNotify(`Jumlah melebihi stok yang tersedia (${product.stok})`, 'error');
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            if (newQty > item.product.stok) {
              showNotify(`Maksimal stok tersedia: ${item.product.stok}`, 'error');
              return item;
            }
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalBelanja = cart.reduce((sum, item) => sum + item.product.harga_jual * item.qty, 0);
  const nominalBayar = paymentMethod === 'tunai' ? Number(cashGiven || 0) : totalBelanja;
  const kembalian = nominalBayar - totalBelanja;

  const handleCheckout = async () => {
    if (!currentUser) {
      showNotify('Silakan login terlebih dahulu!', 'error');
      return;
    }

    if (!activeShift) {
      showNotify('Wajib membuka sesi shift kasir sebelum melakukan transaksi!', 'error');
      setShowShiftModal(true);
      return;
    }

    if (cart.length === 0) {
      showNotify('Keranjang belanja masih kosong', 'error');
      return;
    }

    if (paymentMethod === 'tunai' && nominalBayar < totalBelanja) {
      showNotify('Uang pembayaran tunai kurang dari total belanja!', 'error');
      return;
    }

    try {
      const payload = {
        sesi_shift_id: activeShift.id,
        kasir_id: currentUser.id,
        metode_pembayaran: paymentMethod,
        jumlah_bayar: nominalBayar,
        items: cart.map((item) => ({
          produk_id: item.product.id,
          jumlah_beli: item.qty
        }))
      };

      const res = await api.transaksi.create(payload);
      if (res.success) {
        setLastTransaction(res.data);
        setCart([]);
        setCashGiven('');

        loadProducts();
        loadTransactions();
        setShowReceiptModal(true);
        showNotify(`Transaksi ${res.data.nomor_invoice} berhasil disimpan!`);
      }
    } catch (err) {
      showNotify(err.message, 'error');
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const res = await api.produk.create({
        ...newProduct,
        harga_beli: Number(newProduct.harga_beli),
        harga_jual: Number(newProduct.harga_jual),
        stok: Number(newProduct.stok),
        stok_minimum: Number(newProduct.stok_minimum)
      });
      if (res.success) {
        showNotify(`Produk "${newProduct.nama_barang}" berhasil disimpan ke database!`);
        setShowProductModal(false);
        setNewProduct({
          nama_barang: '',
          barcode: '',
          kode_sku: '',
          harga_beli: '',
          harga_jual: '',
          stok: '50',
          stok_minimum: '5'
        });
        loadProducts();
      }
    } catch (err) {
      showNotify(err.message, 'error');
    }
  };

  // ========================================================
  // JIKA BELUM LOGIN: TAMPILKAN LAYAR LOGIN / PILIH KASIR
  // ========================================================
  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card animate-fade">
          <div className="login-header">
            <span className="login-logo">🏪</span>
            <h1 className="login-title">Aplikasi Kasir POS</h1>
            <p className="login-desc">Silakan masuk untuk memulai sesi shift penjualan</p>
          </div>

          <div className="quick-login-box">
            <span className="quick-login-label">Pilih Akun Cepat (Testing):</span>
            <div className="quick-btn-group">
              <button
                type="button"
                className="quick-btn"
                onClick={() => setLoginForm({ username: 'kasir1', password: 'kasir123' })}
              >
                👤 Kasir Utama
              </button>
              <button
                type="button"
                className="quick-btn"
                onClick={() => setLoginForm({ username: 'admin', password: 'admin123' })}
              >
                ⚡ Super Admin
              </button>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Username Kasir</label>
              {availableUsers.length > 0 ? (
                <select
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  style={{ height: '40px' }}
                >
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.nama} ({u.role}) - @{u.username}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  placeholder="Username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Password / PIN</label>
              <input
                type="password"
                required
                placeholder="Masukkan password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ height: '46px', fontSize: '15px', justifyContent: 'center' }}>
              🔑 Masuk & Buka Sesi Kasir
            </button>
          </form>
        </div>

        {notification.message && (
          <div
            style={{
              position: 'fixed',
              top: '24px',
              right: '24px',
              zIndex: 150,
              padding: '12px 20px',
              borderRadius: '8px',
              background: notification.type === 'error' ? '#ef4444' : '#16a34a',
              color: '#fff',
              fontWeight: 600,
              boxShadow: 'var(--shadow-lg)'
            }}
            className="animate-fade"
          >
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // ========================================================
  // HALAMAN UTAMA POS (KASIR SUDAH LOGIN)
  // ========================================================
  return (
    <div className="pos-container">
      {/* Header Aplikasi */}
      <header className="pos-header">
        <div className="brand-section">
          <span className="brand-logo">🏪</span>
          <div>
            <h1 className="brand-title">POS Kasir Modern</h1>
            <p className="brand-subtitle">Berbasis Shift & Integrasi Scan Barcode Kamera</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Info User / Kasir */}
          <div className="user-badge">
            <span>👤</span>
            <span>{currentUser.nama} ({currentUser.role})</span>
          </div>

          {/* Status Shift Badge */}
          {activeShift ? (
            <div className="shift-badge active">
              <span className="status-dot"></span>
              <span>
                Shift #{activeShift.id} • Modal: {formatRupiah(activeShift.modal_awal)}
              </span>
            </div>
          ) : (
            <div className="shift-badge inactive">
              <span className="status-dot"></span>
              <span>Belum Ada Shift</span>
              <button
                className="btn-success"
                style={{ padding: '3px 8px', fontSize: '11px', marginLeft: '6px' }}
                onClick={() => setShowShiftModal(true)}
              >
                + Buka Shift
              </button>
            </div>
          )}

          {/* Tombol Tutup Shift (Clock-Out) */}
          {activeShift && (
            <button
              className="btn-danger"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={handleOpenCloseShiftModal}
            >
              🔴 Tutup Shift
            </button>
          )}

          {/* Tombol Riwayat Transaksi */}
          <button className="btn-outline" onClick={() => setShowHistoryModal(true)}>
            📋 Riwayat ({transactions.length})
          </button>

          {/* Tombol Tambah Produk Biasa */}
          <button className="btn-primary" onClick={() => setShowProductModal(true)}>
            + Tambah Produk
          </button>

          {/* Tombol Logout */}
          <button
            className="btn-outline"
            style={{ color: '#ef4444' }}
            title="Keluar dari akun"
            onClick={handleLogout}
          >
            🚪 Keluar
          </button>
        </div>
      </header>

      {/* Notifikasi Toast */}
      {notification.message && (
        <div
          style={{
            position: 'fixed',
            top: '72px',
            right: '24px',
            zIndex: 150,
            padding: '12px 20px',
            borderRadius: '8px',
            background: notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#0284c7' : '#16a34a',
            color: '#fff',
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)'
          }}
          className="animate-fade"
        >
          {notification.message}
        </div>
      )}

      {/* Main Content (Katalog Produk & Keranjang) */}
      <main className="pos-main">
        {/* Kolom Kiri: Katalog Produk */}
        <section className="product-section">
          {/* Toolbar Pencarian & Tombol Scan Barcode */}
          <div className="search-toolbar">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Cari nama barang, barcode, atau kode SKU..."
                value={search}
                onChange={handleSearchChange}
              />
            </div>

            {/* Tombol Scan Barcode Kamera */}
            <button
              type="button"
              className="btn-primary"
              style={{ background: '#0284c7', height: '40px', fontWeight: 600 }}
              onClick={() => setShowScannerModal(true)}
              title="Aktifkan kamera untuk scan barcode produk"
            >
              📷 Scan Barcode
            </button>

            <button
              className="btn-outline"
              onClick={() => {
                setSearch('');
                loadProducts('');
              }}
            >
              Reset
            </button>
          </div>

          <div className="product-grid-container">
            {loading ? (
              <p style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>
                Memuat daftar produk...
              </p>
            ) : products.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px' }}>
                <p style={{ fontSize: '36px' }}>📦</p>
                <p>Tidak ada produk yang ditemukan.</p>
              </div>
            ) : (
              <div className="product-grid">
                {products.map((p) => {
                  const isOutOfStock = p.stok <= 0;
                  const isLowStock = p.stok <= p.stok_minimum;

                  return (
                    <div
                      key={p.id}
                      className="product-card"
                      onClick={() => !isOutOfStock && addToCart(p)}
                    >
                      <div className="card-top">
                        <div className="product-badge-group">
                          <span className="sku-badge">{p.kode_sku}</span>
                          {p.barcode && <span className="sku-badge">🏷️ {p.barcode}</span>}
                        </div>
                        <h3 className="product-title">{p.nama_barang}</h3>
                        <span
                          className={`stock-tag ${
                            isOutOfStock
                              ? 'out-of-stock'
                              : isLowStock
                              ? 'low-stock'
                              : 'in-stock'
                          }`}
                        >
                          {isOutOfStock
                            ? 'Stok Habis (0)'
                            : isLowStock
                            ? `Sisa Stok: ${p.stok} (Menipis)`
                            : `Stok: ${p.stok}`}
                        </span>
                      </div>

                      <div className="card-bottom">
                        <div className="product-price">{formatRupiah(p.harga_jual)}</div>
                        <button
                          className="btn-add-cart"
                          disabled={isOutOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(p);
                          }}
                        >
                          + Tambah
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Kolom Kanan: Keranjang Belanja */}
        <aside className="cart-section">
          <div className="cart-header">
            <h2 className="cart-title">
              <span>🛒 Keranjang Belanja</span>
              <span className="cart-badge">{cart.reduce((a, b) => a + b.qty, 0)} item</span>
            </h2>
            {cart.length > 0 && (
              <button
                className="btn-outline"
                style={{ fontSize: '12px', padding: '3px 8px' }}
                onClick={() => setCart([])}
              >
                Kosongkan
              </button>
            )}
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="cart-empty">
                <span style={{ fontSize: '42px' }}>🛒</span>
                <p style={{ fontWeight: 600 }}>Keranjang Kosong</p>
                <small>Pilih produk di katalog atau gunakan tombol Scan Barcode</small>
              </div>
            ) : (
              cart.map(({ product, qty }) => (
                <div key={product.id} className="cart-item">
                  <div className="cart-item-info">
                    <div>
                      <div className="cart-item-name">{product.nama_barang}</div>
                      <div className="cart-item-price">{formatRupiah(product.harga_jual)} / pcs</div>
                    </div>
                    <button
                      className="btn-delete-item"
                      title="Hapus Item"
                      onClick={() => removeFromCart(product.id)}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="cart-item-controls">
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQty(product.id, -1)}>
                        -
                      </button>
                      <span className="qty-val">{qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(product.id, 1)}>
                        +
                      </button>
                    </div>
                    <div className="cart-item-subtotal">
                      {formatRupiah(product.harga_jual * qty)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Checkout Sticky */}
          <div className="cart-footer">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatRupiah(totalBelanja)}</span>
            </div>
            <div className="summary-row total">
              <span>Total Bayar</span>
              <span style={{ color: '#2563eb' }}>{formatRupiah(totalBelanja)}</span>
            </div>

            <div className="payment-method-select">
              <label className="payment-label">Metode Pembayaran</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="tunai">Uang Tunai (Cash)</option>
                <option value="qris">QRIS</option>
                <option value="debit">Kartu Debit</option>
                <option value="transfer">Transfer Bank</option>
              </select>
            </div>

            {paymentMethod === 'tunai' && cart.length > 0 && (
              <div>
                <label className="payment-label">Uang Diterima (Rp)</label>
                <input
                  type="number"
                  placeholder="Masukkan nominal uang"
                  style={{ width: '100%', marginTop: '3px', height: '36px' }}
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                    onClick={() => setCashGiven(totalBelanja.toString())}
                  >
                    Uang Pas
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                    onClick={() => {
                      const rounded = Math.ceil(totalBelanja / 50000) * 50000;
                      setCashGiven((rounded > totalBelanja ? rounded : totalBelanja + 50000).toString());
                    }}
                  >
                    +50.000
                  </button>
                </div>
                <div className="summary-row" style={{ marginTop: '6px', fontWeight: 600 }}>
                  <span>Kembalian:</span>
                  <span style={{ color: kembalian >= 0 ? '#16a34a' : '#ef4444' }}>
                    {kembalian >= 0 ? formatRupiah(kembalian) : 'Kurang ' + formatRupiah(Math.abs(kembalian))}
                  </span>
                </div>
              </div>
            )}

            <button
              className="btn-checkout"
              disabled={cart.length === 0}
              onClick={handleCheckout}
            >
              <span>💳 Selesaikan Transaksi</span>
            </button>
          </div>
        </aside>
      </main>

      {/* ======================================================== */}
      {/* 1. MODAL SCAN BARCODE KAMERA                             */}
      {/* ======================================================== */}
      <BarcodeScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanSuccess={handleBarcodeScanned}
      />

      {/* ======================================================== */}
      {/* 2. MODAL QUICK ADD PRODUK (BARCODE BELUM TERDAFTAR)      */}
      {/* ======================================================== */}
      {showQuickAddModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <span>⚠️ Barcode Belum Terdaftar</span>
              </h3>
              <button className="modal-close" onClick={() => setShowQuickAddModal(false)}>
                ✕
              </button>
            </div>

            <div className="quick-add-banner">
              <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '14px' }}>
                🏷️ Kode Barcode: <code>{quickAddForm.barcode}</code>
              </span>
              <span style={{ fontSize: '12px', color: '#334155' }}>
                Barcode ini belum ada di tabel produk. Lengkapi form singkat berikut untuk mendaftarkan dan <strong>langsung memasukkannya ke keranjang belanja</strong>.
              </span>
            </div>

            <form onSubmit={handleQuickAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Nama Barang</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: Chiki Balls Keju 55g"
                  value={quickAddForm.nama_barang}
                  onChange={(e) => setQuickAddForm({ ...quickAddForm, nama_barang: e.target.value })}
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Barcode</label>
                  <input
                    type="text"
                    readOnly
                    style={{ background: '#f1f5f9', fontWeight: 600 }}
                    value={quickAddForm.barcode}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Kode SKU</label>
                  <input
                    type="text"
                    required
                    value={quickAddForm.kode_sku}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, kode_sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Harga Beli / HPP (Rp)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="0"
                    value={quickAddForm.harga_beli}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, harga_beli: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Jual (Rp)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="0"
                    value={quickAddForm.harga_jual}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, harga_jual: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Stok Awal</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={quickAddForm.stok}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, stok: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stok Minimum</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={quickAddForm.stok_minimum}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, stok_minimum: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '12px' }}>
                <button type="button" className="btn-outline" onClick={() => setShowQuickAddModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-success" style={{ height: '42px', fontWeight: 'bold' }}>
                  💾 Simpan & Masukkan Keranjang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MODAL BUKA SHIFT (CLOCK-IN)                           */}
      {/* ======================================================== */}
      {showShiftModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade">
            <div className="modal-header">
              <h3 className="modal-title">
                <span>🟢 Buka Sesi Shift Kasir (Clock-In)</span>
              </h3>
              {activeShift && (
                <button className="modal-close" onClick={() => setShowShiftModal(false)}>
                  ✕
                </button>
              )}
            </div>

            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '13px', color: '#15803d' }}>
              Halo, <strong>{currentUser.nama}</strong>! Masukkan uang tunai fisik yang ada di laci kasir untuk memulai shift.
            </div>

            <form onSubmit={handleStartShift}>
              <div className="form-group">
                <label className="form-label">Modal Awal Laci Kasir (Rp)</label>
                <input
                  type="number"
                  required
                  min="0"
                  style={{ height: '42px', fontSize: '16px', fontWeight: 'bold' }}
                  value={modalAwalInput}
                  onChange={(e) => setModalAwalInput(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {[50000, 100000, 150000, 200000].map((nominal) => (
                    <button
                      key={nominal}
                      type="button"
                      className="btn-outline"
                      style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                      onClick={() => setModalAwalInput(nominal.toString())}
                    >
                      {formatRupiah(nominal)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-outline" onClick={handleLogout}>
                  Ganti Kasir / Keluar
                </button>
                <button type="submit" className="btn-success" style={{ height: '42px' }}>
                  Mulai Shift & Buka POS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MODAL TUTUP SHIFT (CLOCK-OUT) & AUDIT SELISIH KAS     */}
      {/* ======================================================== */}
      {showCloseShiftModal && shiftSummary && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <span>🔴 Tutup Shift & Rekap Kas (Clock-Out)</span>
              </h3>
              <button className="modal-close" onClick={() => setShowCloseShiftModal(false)}>
                ✕
              </button>
            </div>

            <div className="recap-grid">
              <div className="recap-item">
                <span className="recap-label">Kasir Bertugas:</span>
                <span className="recap-value">{currentUser.nama}</span>
              </div>
              <div className="recap-item">
                <span className="recap-label">Waktu Buka Shift:</span>
                <span className="recap-value" style={{ fontSize: '12px' }}>{shiftSummary.shift?.waktu_mulai}</span>
              </div>
              <div className="recap-item">
                <span className="recap-label">Modal Awal Laci:</span>
                <span className="recap-value">{formatRupiah(shiftSummary.modal_awal)}</span>
              </div>
              <div className="recap-item">
                <span className="recap-label">Penjualan Tunai ({shiftSummary.count_tunai} trx):</span>
                <span className="recap-value" style={{ color: '#16a34a' }}>+{formatRupiah(shiftSummary.total_tunai)}</span>
              </div>
              <div className="recap-item">
                <span className="recap-label">Penjualan Non-Tunai ({shiftSummary.count_non_tunai} trx):</span>
                <span className="recap-value" style={{ color: '#64748b' }}>{formatRupiah(shiftSummary.total_non_tunai)}</span>
              </div>
              <div className="recap-item">
                <span className="recap-label">Total Omzet Penjualan:</span>
                <span className="recap-value">{formatRupiah(shiftSummary.total_omzet)}</span>
              </div>

              <div className="recap-highlight">
                <span style={{ fontWeight: 600 }}>UANG SEHARUSNYA DI LACI:</span>
                <span className="recap-value">{formatRupiah(shiftSummary.kas_diharapkan)}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Hitungan Fisik Uang Kas Aktual di Laci (Rp)</label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="Hitung fisik uang di laci..."
                  style={{ height: '42px', fontSize: '16px', fontWeight: 'bold' }}
                  value={kasAktualInput}
                  onChange={(e) => setKasAktualInput(e.target.value)}
                />
              </div>

              {kasAktualInput !== '' && (
                (() => {
                  const selisih = Number(kasAktualInput) - shiftSummary.kas_diharapkan;
                  let boxClass = 'match';
                  let text = '✅ Kas Seimbang (Pas / Tidak Ada Selisih)';

                  if (selisih < 0) {
                    boxClass = 'deficit';
                    text = `⚠️ Selisih Kurang: ${formatRupiah(selisih)} (Uang Fisik Kurang!)`;
                  } else if (selisih > 0) {
                    boxClass = 'surplus';
                    text = `⚠️ Selisih Lebih: +${formatRupiah(selisih)} (Uang Fisik Lebih)`;
                  }

                  return (
                    <div className={`discrepancy-box ${boxClass}`}>
                      <span>Status Selisih:</span>
                      <span>{text}</span>
                    </div>
                  );
                })()
              )}

              <div className="form-group">
                <label className="form-label">Catatan Shift (Opsional)</label>
                <input
                  type="text"
                  placeholder="Catatan kendala, alasan selisih, atau serah terima..."
                  value={catatanShiftInput}
                  onChange={(e) => setCatatanShiftInput(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowCloseShiftModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-danger" style={{ height: '42px', fontWeight: 'bold' }}>
                  Selesaikan & Tutup Shift Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL HASIL AUDIT PENUTUPAN SHIFT                     */}
      {/* ======================================================== */}
      {showCloseResultModal && closedShiftResult && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade">
            <div className="modal-header">
              <h3 className="modal-title">📋 Laporan Audit Tutup Shift #{closedShiftResult.id}</h3>
              <button className="modal-close" onClick={() => setShowCloseResultModal(false)}>
                ✕
              </button>
            </div>

            <div className="receipt-box" id="shift-report">
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
                LAPORAN AUDIT SHIFT KASIR
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                STATUS: RESMI DITUTUP ({closedShiftResult.waktu_selesai})
              </div>
              <div className="receipt-divider"></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Kasir:</span>
                <span>{currentUser.nama}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Modal Awal:</span>
                <span>{formatRupiah(closedShiftResult.modal_awal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Penjualan Tunai:</span>
                <span>+{formatRupiah(closedShiftResult.total_penjualan_tunai)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Kas Diharapkan:</span>
                <span>{formatRupiah(closedShiftResult.kas_diharapkan)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Kas Fisik Aktual:</span>
                <span>{formatRupiah(closedShiftResult.kas_aktual_akhir)}</span>
              </div>
              <div className="receipt-divider"></div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 'bold',
                color: closedShiftResult.selisih_kas === 0 ? '#16a34a' : closedShiftResult.selisih_kas < 0 ? '#ef4444' : '#d97706'
              }}>
                <span>SELISIH KAS:</span>
                <span>
                  {closedShiftResult.selisih_kas === 0
                    ? 'Rp 0 (PAS)'
                    : formatRupiah(closedShiftResult.selisih_kas)}
                </span>
              </div>
              {closedShiftResult.catatan_shift && (
                <div style={{ fontSize: '11px', marginTop: '4px', color: '#64748b' }}>
                  Catatan: {closedShiftResult.catatan_shift}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={() => window.print()}>
                🖨️ Cetak Rekap Shift
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowCloseResultModal(false);
                  setShowShiftModal(true);
                }}
              >
                Buka Shift Baru
              </button>
              <button
                type="button"
                className="btn-outline"
                style={{ color: '#ef4444' }}
                onClick={() => {
                  setShowCloseResultModal(false);
                  handleLogout();
                }}
              >
                Keluar (Logout)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MODAL STRUK TRANSAKSI SUKSES                          */}
      {/* ======================================================== */}
      {showReceiptModal && lastTransaction && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade">
            <div className="modal-header">
              <h3 className="modal-title">✅ Transaksi Berhasil!</h3>
              <button className="modal-close" onClick={() => setShowReceiptModal(false)}>
                ✕
              </button>
            </div>
            <div className="receipt-box" id="print-area">
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
                POS KASIR BERBASIS SHIFT
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                TERSIMPAN DI DATABASE SQLITE
              </div>
              <div className="receipt-divider"></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Invoice:</span>
                <span style={{ fontWeight: 'bold' }}>{lastTransaction.nomor_invoice}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Shift ID:</span>
                <span>#{lastTransaction.sesi_shift_id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Kasir:</span>
                <span>{lastTransaction.nama_kasir || currentUser.nama}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Waktu:</span>
                <span>{lastTransaction.waktu_transaksi || new Date().toLocaleString('id-ID')}</span>
              </div>
              <div className="receipt-divider"></div>
              {lastTransaction.items?.map((it) => (
                <div key={it.id || it.produk_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {it.nama_barang} x{it.jumlah_beli || it.qty}
                  </span>
                  <span>{formatRupiah(it.subtotal || (it.harga_satuan * (it.jumlah_beli || it.qty)))}</span>
                </div>
              ))}
              <div className="receipt-divider"></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>TOTAL:</span>
                <span>{formatRupiah(lastTransaction.total_harga)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>METODE:</span>
                <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {lastTransaction.metode_pembayaran}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>DIBAYAR:</span>
                <span>{formatRupiah(lastTransaction.jumlah_bayar)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 'bold' }}>
                <span>KEMBALIAN:</span>
                <span>{formatRupiah(lastTransaction.kembalian)}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => window.print()}
              >
                🖨️ Cetak Struk
              </button>
              <button className="btn-primary" onClick={() => setShowReceiptModal(false)}>
                Selesai / Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL RIWAYAT TRANSAKSI TERBARU                       */}
      {/* ======================================================== */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <span>📋 Riwayat Transaksi Terbaru</span>
                <span className="cart-badge">{transactions.length} Transaksi</span>
              </h3>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>
                ✕
              </button>
            </div>

            <div className="history-list">
              {transactions.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                  Belum ada transaksi yang tersimpan.
                </p>
              ) : (
                transactions.map((trx) => (
                  <div key={trx.id} className="history-card">
                    <div className="history-card-header">
                      <span className="invoice-tag">{trx.nomor_invoice}</span>
                      <span className="shift-badge active" style={{ fontSize: '11px', padding: '2px 8px' }}>
                        Shift #{trx.sesi_shift_id} • {trx.status_transaksi || 'selesai'}
                      </span>
                    </div>

                    <div className="history-meta">
                      <span>🕒 {trx.waktu_transaksi}</span>
                      <span>• Kasir: {trx.nama_kasir}</span>
                      <span>• {trx.metode_pembayaran.toUpperCase()}</span>
                    </div>

                    <div className="history-items-summary">
                      {trx.items?.map((it) => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {it.nama_barang} x{it.jumlah_beli}
                          </span>
                          <span>{formatRupiah(it.subtotal)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="history-card-footer">
                      <div>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Total: </span>
                        <span className="history-total">{formatRupiah(trx.total_harga)}</span>
                      </div>
                      <button
                        className="btn-outline"
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                        onClick={() => {
                          setLastTransaction(trx);
                          setShowReceiptModal(true);
                        }}
                      >
                        Lihat Struk
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setShowHistoryModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. MODAL TAMBAH PRODUK BIASA                             */}
      {/* ======================================================== */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-fade">
            <div className="modal-header">
              <h3 className="modal-title">Tambah Produk Baru</h3>
              <button className="modal-close" onClick={() => setShowProductModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <div className="form-group">
                <label className="form-label">Nama Barang</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kopi Latte Double Shot"
                  value={newProduct.nama_barang}
                  onChange={(e) => setNewProduct({ ...newProduct, nama_barang: e.target.value })}
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Kode SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="SKU-XXX"
                    value={newProduct.kode_sku}
                    onChange={(e) => setNewProduct({ ...newProduct, kode_sku: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Barcode</label>
                  <input
                    type="text"
                    placeholder="Opsional / Scan"
                    value={newProduct.barcode}
                    onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Harga Beli / HPP (Rp)</label>
                  <input
                    type="number"
                    required
                    placeholder="0"
                    value={newProduct.harga_beli}
                    onChange={(e) => setNewProduct({ ...newProduct, harga_beli: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Jual (Rp)</label>
                  <input
                    type="number"
                    required
                    placeholder="0"
                    value={newProduct.harga_jual}
                    onChange={(e) => setNewProduct({ ...newProduct, harga_jual: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Jumlah Stok</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={newProduct.stok}
                    onChange={(e) => setNewProduct({ ...newProduct, stok: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stok Minimum</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newProduct.stok_minimum}
                    onChange={(e) => setNewProduct({ ...newProduct, stok_minimum: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowProductModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
