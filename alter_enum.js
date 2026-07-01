const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    await conn.query("ALTER TABLE StayLogs MODIFY final_status ENUM('Sembuh', 'Rujukan Lanjut', 'Meninggal', 'Transfer', 'Pulang Paksa', 'Lainnya') NULL");
    console.log("Altered StayLogs final_status successfully.");
  } catch (err) {
    console.error(err);
  }
  await conn.end();
}
run();
