/**
 * Migration: Tambah kolom departure_photo_path di StayLogs
 * Jalankan: node migrate-staylogs-departure-photo.js
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

    console.log('Migrating StayLogs departure_photo_path column...');

    try {
      await connection.query(`
        ALTER TABLE StayLogs ADD COLUMN departure_photo_path VARCHAR(255) NULL
      `);
      console.log('StayLogs: added departure_photo_path');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD' || e.errno === 1060 || /duplicate column/i.test(e.message || '')) {
        console.log('StayLogs: departure_photo_path already exists');
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

