/**
 * Truncate semua data kecuali Users, Rooms, Ambulances.
 * Tabel yang dikosongkan: AmbulanceLogPatients, AmbulanceLogs, StayLogVisitors, StayLogs,
 * PatientRegistrations, Documents, Visitors, Beds, Patients.
 * Jalankan: node truncate-all-except-users.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Urutan: child dulu karena foreign key (yang di-referensi tetap ada: Rooms, Ambulances)
const TABLES_TO_TRUNCATE = [
  'AmbulanceLogPatients',
  'AmbulanceLogs',
  'StayLogVisitors',
  'StayLogs',
  'PatientRegistrations',
  'Documents',
  'Visitors',
  'Beds',
  'Patients'
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
    console.log('Truncating tables (Users, Rooms, Ambulances will be kept)...');

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of TABLES_TO_TRUNCATE) {
      try {
        await connection.query(`TRUNCATE TABLE \`${table}\``);
        console.log(`  Truncated: ${table}`);
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
          console.log(`  Skip (table not found): ${table}`);
        } else throw e;
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Done. Data cleared except Users, Rooms, Ambulances.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

truncateAllExceptUsers();
