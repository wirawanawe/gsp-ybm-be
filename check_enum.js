const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const [rows] = await conn.query("SHOW COLUMNS FROM StayLogs WHERE Field = 'final_status'");
  console.log(rows);
  await conn.end();
}
check();
