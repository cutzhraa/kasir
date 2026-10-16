require('dotenv').config();
const app = require('./app');
const initDatabase = require('./database/initDb');

const PORT = process.env.PORT || 5000;

initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server backend POS berjalan di http://localhost:${PORT}`);
            console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
        });
    })
    .catch((error) => {
        console.error('❌ Server tidak dapat dimulai:', error);
        process.exit(1);
    });
