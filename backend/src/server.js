require('dotenv').config();
const app = require('./app');
const initDatabase = require('./database/initDb');

const PORT = process.env.PORT || 5000;

// Pastikan skema database dan seed awal telah siap
initDatabase();

app.listen(PORT, () => {
    console.log(`🚀 Server backend POS berjalan di http://localhost:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
});

