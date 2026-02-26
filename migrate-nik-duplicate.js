/**
 * Migration: Hapus UNIQUE constraint dari NIK agar pasien bisa mendaftar ulang
 * Jalankan: node migrate-nik-duplicate.js
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

    console.log('Removing UNIQUE constraint from Patients.nik...');
    await connection.query(`
      ALTER TABLE Patients DROP INDEX nik
    `);
    console.log('Done. Patients can now re-register with same NIK.');
  } catch (error) {
    if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('NIK index may not exist or has different name. Checking...');
      const [indexes] = await connection.query(`SHOW INDEX FROM Patients WHERE Column_name = 'nik'`);
      if (indexes.length === 0) console.log('No NIK unique constraint found - may already be removed.');
      else console.log('Indexes:', indexes);
    } else {
      console.error('Migration error:', error.message);
      process.exit(1);
    }
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

migrate();
