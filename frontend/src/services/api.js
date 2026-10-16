// API Service Client untuk komunikasi dengan Backend Express
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
    const token = localStorage.getItem('pos_token');
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401 && endpoint !== '/auth/login') {
                localStorage.removeItem('pos_token');
                localStorage.removeItem('pos_user');
                window.dispatchEvent(new Event('pos:unauthorized'));
            }
            throw new Error(data.message || 'Terjadi kesalahan pada request API');
        }

        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

export const api = {
    // 1. Produk API
    produk: {
        getAll: (search = '') => 
            request(`/produk${search ? `?search=${encodeURIComponent(search)}` : ''}`),
        
        getByCode: async (code) => {
            try {
                return await request(`/produk/${encodeURIComponent(code)}`);
            } catch (err) {
                return { success: false, data: null, message: err.message };
            }
        },

        lookupBarcode: (code) =>
            request(`/produk/lookup/${encodeURIComponent(code)}`),
        
        create: (data) => 
            request('/produk', {
                method: 'POST',
                body: JSON.stringify(data)
            })
    },

    // 2. Sesi Shift Kasir API
    shift: {
        getActive: (userId) => 
            request(`/shift/active?userId=${userId}`),
        
        mulai: (data) => 
            request('/shift/mulai', {
                method: 'POST',
                body: JSON.stringify(data)
            }),
        
        tutup: (shiftId, data) => 
            request(`/shift/${shiftId}/close`, {
                method: 'POST',
                body: JSON.stringify(data)
            }),
        
        getSummary: (shiftId) => 
            request(`/shift/${shiftId}/summary`)
    },

    // 3. Transaksi Penjualan API
    transaksi: {
        getAll: (shiftId = '') => 
            request(`/transaksi${shiftId ? `?shift_id=${shiftId}` : ''}`),
        
        getById: (id) => 
            request(`/transaksi/${id}`),
        
        create: (payload) => 
            request('/transaksi', {
                method: 'POST',
                body: JSON.stringify(payload)
            })
    },

    // 4. Autentikasi Kasir
    auth: {
        login: (credentials) => 
            request('/auth/login', {
                method: 'POST',
                body: JSON.stringify(credentials)
            }),
        
        getUsers: () => 
            request('/auth/users')
    }
};

export default api;
