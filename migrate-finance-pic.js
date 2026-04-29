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

    // Add person_in_charge to FinanceIncome
    try {
      await connection.query('ALTER TABLE FinanceIncome ADD COLUMN person_in_charge VARCHAR(255) NULL;');
      console.log('✅ Added person_in_charge to FinanceIncome');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ person_in_charge already exists in FinanceIncome');
      } else {
        throw e;
      }
    }

    // Add person_in_charge to FinanceExpenses
    try {
      await connection.query('ALTER TABLE FinanceExpenses ADD COLUMN person_in_charge VARCHAR(255) NULL;');
      console.log('✅ Added person_in_charge to FinanceExpenses');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ person_in_charge already exists in FinanceExpenses');
      } else {
        throw e;
      }
    }

    console.log('\n✅ Migrasi Penanggung Jawab Keuangan berhasil!');
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
