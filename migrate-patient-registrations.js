/**
 * Migration: Tabel PatientRegistrations (patient_id, registration_number) untuk riwayat registrasi.
 * Satu pasien bisa punya banyak nomor registrasi (pendaftaran ulang tidak buat baris pasien baru).
 * Jalankan: node migrate-patient-registrations.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'gsp_ybm'
    });
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS PatientRegistrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id INT NOT NULL,
                registration_number VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
                INDEX idx_patient_reg (patient_id),
                INDEX idx_reg_number (registration_number)
            )
        `);
        console.log('PatientRegistrations table created or already exists.');
    } finally {
        await connection.end();
    }
}
run().catch((e) => { console.error(e); process.exit(1); });
