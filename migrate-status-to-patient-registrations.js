/**
 * Migration: Pindah status_mustahik, status_verification ke PatientRegistrations,
 * dan tambah status_rumah_singgah di PatientRegistrations. Hapus dari Patients.
 * Jalankan: node migrate-status-to-patient-registrations.js
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
        // 1. Tambah kolom di PatientRegistrations (jika belum ada)
        const [cols] = await connection.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PatientRegistrations' AND COLUMN_NAME IN ('status_mustahik','status_verification','status_rumah_singgah')`,
            [process.env.DB_NAME || 'gsp_ybm']
        );
        const has = new Set(cols.map((r) => r.COLUMN_NAME));
        if (!has.has('status_mustahik')) {
            await connection.query(`
                ALTER TABLE PatientRegistrations 
                ADD COLUMN status_mustahik ENUM('Mustahik', 'Non-Mustahik') NOT NULL DEFAULT 'Mustahik'
            `);
            console.log('PatientRegistrations: added status_mustahik');
        }
        if (!has.has('status_verification')) {
            await connection.query(`
                ALTER TABLE PatientRegistrations 
                ADD COLUMN status_verification ENUM('Pending', 'Layak Mustahik', 'Rujukan Lain') DEFAULT 'Pending'
            `);
            console.log('PatientRegistrations: added status_verification');
        }
        if (!has.has('status_rumah_singgah')) {
            await connection.query(`
                ALTER TABLE PatientRegistrations 
                ADD COLUMN status_rumah_singgah ENUM('Menunggu', 'Dirawat', 'Sudah Pulang') DEFAULT 'Menunggu'
            `);
            console.log('PatientRegistrations: added status_rumah_singgah');
        }

        // 2. Cek apakah Patients masih punya kolom status (untuk backfill)
        const [pCols] = await connection.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Patients' AND COLUMN_NAME IN ('status_mustahik','status_verification')`,
            [process.env.DB_NAME || 'gsp_ybm']
        );
        const pHas = new Set(pCols.map((r) => r.COLUMN_NAME));

        if (pHas.has('status_mustahik') && pHas.has('status_verification')) {
            // 3. Update existing PatientRegistrations dari data Patients
            await connection.query(`
                UPDATE PatientRegistrations pr
                INNER JOIN Patients p ON p.id = pr.patient_id
                SET 
                    pr.status_mustahik = p.status_mustahik,
                    pr.status_verification = COALESCE(p.status_verification, 'Pending'),
                    pr.status_rumah_singgah = CASE
                        WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NULL) THEN 'Dirawat'
                        WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) THEN 'Sudah Pulang'
                        ELSE 'Menunggu'
                    END
            `);
            console.log('Backfilled PatientRegistrations from Patients.');

            // 4. Pasien yang belum punya baris di PatientRegistrations: buat satu baris
            await connection.query(`
                INSERT INTO PatientRegistrations (patient_id, registration_number, status_mustahik, status_verification, status_rumah_singgah)
                SELECT p.id, p.registration_number, p.status_mustahik, COALESCE(p.status_verification, 'Pending'),
                    CASE
                        WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NULL) THEN 'Dirawat'
                        WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) THEN 'Sudah Pulang'
                        ELSE 'Menunggu'
                    END
                FROM Patients p
                WHERE NOT EXISTS (SELECT 1 FROM PatientRegistrations pr WHERE pr.patient_id = p.id)
            `);
            console.log('Created missing PatientRegistrations rows.');

            // 5. Hapus kolom dari Patients
            await connection.query('ALTER TABLE Patients DROP COLUMN status_mustahik');
            await connection.query('ALTER TABLE Patients DROP COLUMN status_verification');
            console.log('Dropped status_mustahik, status_verification from Patients.');
        } else {
            console.log('Patients already migrated (status columns not found).');
        }
    } finally {
        await connection.end();
    }
}
run().catch((e) => { console.error(e); process.exit(1); });
