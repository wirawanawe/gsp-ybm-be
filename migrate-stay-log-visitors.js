/**
 * Migration: Buat tabel StayLogVisitors (penunggu per stay) untuk fitur Tambah Penunggu.
 * Jalankan: node migrate-stay-log-visitors.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'gsp_ybm'
    });
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS StayLogVisitors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                stay_log_id INT NOT NULL,
                visitor_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stay_log_id) REFERENCES StayLogs(id) ON DELETE CASCADE,
                FOREIGN KEY (visitor_id) REFERENCES Visitors(id) ON DELETE CASCADE,
                UNIQUE KEY uq_stay_visitor (stay_log_id, visitor_id)
            )
        `);
        console.log('StayLogVisitors table created or already exists.');
    } finally {
        await connection.end();
    }
}
run().catch((e) => { console.error(e); process.exit(1); });
