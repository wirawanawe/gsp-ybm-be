/**
 * Migration: Tambah kolom destination di AmbulanceLogPatients
 * Jalankan: node migrate-ambulance-log-patient-destination.js
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

    console.log('Migrating AmbulanceLogPatients destination column...');

    try {
      await connection.query(`
        ALTER TABLE AmbulanceLogPatients ADD COLUMN destination TEXT NULL
      `);
      console.log('AmbulanceLogPatients: added destination column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD' || e.errno === 1060 || /duplicate column/i.test(e.message || '')) {
        console.log('AmbulanceLogPatients: destination column already exists');
      } else {
        throw e;
      }
    }

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

