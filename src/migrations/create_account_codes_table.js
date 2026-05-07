require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gsp_ybm',
    });

    console.log('Connected to database:', process.env.DB_NAME);

    // Create AccountCodes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS AccountCodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        type ENUM('Income', 'Expense', 'Both') NOT NULL DEFAULT 'Both',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT NULL
      )
    `);
    console.log('Table AccountCodes created/verified.');

    // Seed initial account codes if empty
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM AccountCodes');
    if (rows[0].count === 0) {
      const initialCodes = [
        ['Donasi', 'Donasi', 'Income'],
        ['Infaq', 'Infaq', 'Income'],
        ['Zakat', 'Zakat', 'Income'],
        ['Wakaf', 'Wakaf', 'Income'],
        ['Dana YBM', 'Dana YBM', 'Income'],
        ['Operasional', 'Operasional', 'Expense'],
        ['Konsumsi', 'Konsumsi', 'Expense'],
        ['Transportasi', 'Transportasi', 'Expense'],
        ['Kesehatan', 'Kesehatan', 'Expense'],
        ['Utilitas', 'Utilitas', 'Expense'],
        ['Gaji', 'Gaji', 'Expense'],
        ['Lainnya', 'Lainnya', 'Both']
      ];
      for (const [code, name, type] of initialCodes) {
        await connection.query(
          'INSERT INTO AccountCodes (code, name, type) VALUES (?, ?, ?)',
          [code, name, type]
        );
      }
      console.log('Seed: Initial account codes created.');
    }

    console.log('\n✅ Migrasi AccountCodes berhasil!');
  } catch (error) {
    console.error('❌ Error saat migrasi:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Koneksi MySQL ditutup.');
    }
    process.exit(0);
  }
}

migrate();
