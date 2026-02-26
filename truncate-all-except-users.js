/**
 * Truncate semua tabel kecuali Users.
 * Menghapus semua data: Patients, Documents, Visitors, Rooms, Beds, StayLogs, Ambulances, AmbulanceLogs.
 * Jalankan: node truncate-all-except-users.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const TABLES_TO_TRUNCATE = [
  'AmbulanceLogs',
  'StayLogs',
  'Documents',
  'Visitors',
  'Beds',
  'Patients',
  'Ambulances',
  'Rooms'
];

async function truncateAllExceptUsers() {
  let connection;
  try {
    const dbName = process.env.DB_NAME || 'gsp_ybm';
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: dbName
    });

    console.log(`Connected to database: ${dbName}`);
    console.log('Truncating tables (Users will be kept)...');

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of TABLES_TO_TRUNCATE) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  Truncated: ${table}`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Done. All data cleared except Users.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

truncateAllExceptUsers();
