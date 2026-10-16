const { Pool, types } = require('pg');

types.setTypeParser(1700, Number);
types.setTypeParser(20, Number);

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL wajib diatur untuk koneksi Supabase PostgreSQL');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
});

async function withTransaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { pool, withTransaction };
