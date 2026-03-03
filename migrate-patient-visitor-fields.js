/**
 * Migration: Tambah kolom untuk Patients (alamat lengkap, diagnosa, dll) dan Visitors (phone, KTP/KK opsional).
 * Jalankan sekali: node migrate-patient-visitor-fields.js
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

    console.log('Migrating patient and visitor fields...');

    // Patients: kolom alamat lengkap, diagnosa, rencana tindakan, pekerjaan, penghasilan
    const patientCols = [
      'rt_rw VARCHAR(50)',
      'kelurahan VARCHAR(100)',
      'kecamatan VARCHAR(100)',
      'kabupaten VARCHAR(100)',
      'provinsi VARCHAR(100)',
      'diagnosis TEXT',
      'treatment_plan TEXT',
      'occupation VARCHAR(100)',
      'income VARCHAR(100)',
    ];
    for (const col of patientCols) {
      const colName = col.split(' ')[0];
      try {
        await connection.query(`
          ALTER TABLE Patients ADD COLUMN ${col} NULL
        `);
        console.log(`Patients: added ${colName}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELD' || e.errno === 1060 || /duplicate column/i.test(e.message || '')) {
          console.log(`Patients: ${colName} already exists`);
        } else throw e;
      }
    }

    // Visitors: phone, KTP/KK opsional
    try {
      await connection.query(`
        ALTER TABLE Visitors ADD COLUMN phone VARCHAR(30) NULL
      `);
      console.log('Visitors: added phone');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD' || e.errno === 1060 || /duplicate column/i.test(e.message || '')) {
        console.log('Visitors: phone already exists');
      } else throw e;
    }
    try {
      await connection.query(`
        ALTER TABLE Visitors MODIFY COLUMN ktp_path VARCHAR(255) NULL,
        MODIFY COLUMN kk_path VARCHAR(255) NULL
      `);
      console.log('Visitors: ktp_path, kk_path now nullable');
    } catch (e) {
      console.log('Visitors: ktp/kk modify skipped:', e.message);
    }

    // StayLogs: alasan pindah untuk transfer
    try {
      await connection.query(`
        ALTER TABLE StayLogs ADD COLUMN transfer_reason TEXT NULL
      `);
      console.log('StayLogs: added transfer_reason');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD' || e.errno === 1060 || /duplicate column/i.test(e.message || '')) {
        console.log('StayLogs: transfer_reason already exists');
      } else throw e;
    }
    try {
      await connection.query(`
        ALTER TABLE StayLogs MODIFY COLUMN final_status ENUM('Sembuh', 'Rujukan Lanjut', 'Meninggal', 'Transfer') NULL
      `);
      console.log('StayLogs: added Transfer to final_status enum');
    } catch (e) {
      console.log('StayLogs: enum modify skipped:', e.message);
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
