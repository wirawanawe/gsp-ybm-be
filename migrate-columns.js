/**
 * Migration: Perbesar kolom nik dan phone untuk menampung input yang lebih panjang.
 * Jalankan sekali: node migrate-columns.js
 */
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

    console.log('Migrating column sizes...');

    await connection.query(`
      ALTER TABLE Patients
        MODIFY COLUMN nik VARCHAR(24) NOT NULL,
        MODIFY COLUMN phone VARCHAR(30) NOT NULL
    `);
    console.log('Patients: nik -> VARCHAR(24), phone -> VARCHAR(30)');

    await connection.query(`
      ALTER TABLE Visitors MODIFY COLUMN nik VARCHAR(24) NOT NULL
    `);
    console.log('Visitors: nik -> VARCHAR(24)');

    console.log('Migration completed.');
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

migrate();
