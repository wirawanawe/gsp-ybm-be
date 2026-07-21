require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gsp_ybm'
    });

    console.log('Connected to MySQL database.');

    // Update the ENUM for status_verification in PatientRegistrations table
    await connection.query(`
      ALTER TABLE PatientRegistrations
      MODIFY COLUMN status_verification ENUM('Pending', 'Layak Mustahik', 'Rujukan Lain', 'Batal') DEFAULT 'Pending';
    `);
    console.log("Successfully added 'Batal' to status_verification ENUM in PatientRegistrations table.");

  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection closed.');
    }
    process.exit(0);
  }
}

migrate();
