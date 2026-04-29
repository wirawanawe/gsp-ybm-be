require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDates() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gsp_ybm',
    });

    console.log('Connected to database:', process.env.DB_NAME);

    // Update 2025 to 2026
    await connection.query(`UPDATE FinanceIncome SET income_date = DATE_ADD(income_date, INTERVAL 1 YEAR) WHERE YEAR(income_date) = 2025`);
    await connection.query(`UPDATE FinanceExpenses SET expense_date = DATE_ADD(expense_date, INTERVAL 1 YEAR) WHERE YEAR(expense_date) = 2025`);
    
    console.log('✅ Berhasil update data dummy dari tahun 2025 ke 2026');

  } catch (error) {
    console.error('❌ Error saat update data:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Koneksi MySQL ditutup.');
    }
  }
}

fixDates();
