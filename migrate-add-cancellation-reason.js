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

    // Add cancellation_reason column to PatientRegistrations
    await connection.query(`
      ALTER TABLE PatientRegistrations
      ADD COLUMN cancellation_reason TEXT NULL;
    `);
    console.log('Successfully added cancellation_reason column to PatientRegistrations table.');

  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Column cancellation_reason already exists in PatientRegistrations table.');
    } else {
      console.error('Error during migration:', error);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection closed.');
    }
    process.exit(0);
  }
}

migrate();
