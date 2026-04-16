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

    // 1. ActivitySchedules — Jadwal Tahsin, Taklim, Kegiatan Harian
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ActivitySchedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('Tahsin', 'Taklim', 'Kegiatan Harian') NOT NULL,
        title VARCHAR(255) NOT NULL,
        day_of_week ENUM('Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Ahad') NULL,
        scheduled_date DATE NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        location VARCHAR(255),
        facilitator VARCHAR(255),
        notes TEXT,
        is_recurring TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT NULL
      )
    `);
    console.log('Table ActivitySchedules created/verified.');

    // 2. ActivityAttendance — Presensi peserta kegiatan
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ActivityAttendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL,
        participant_name VARCHAR(255) NOT NULL,
        participant_type ENUM('Pasien', 'Penunggu', 'Umum') DEFAULT 'Umum',
        patient_id INT NULL,
        attendance_date DATE NOT NULL,
        status ENUM('Hadir', 'Tidak Hadir', 'Izin') DEFAULT 'Hadir',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (schedule_id) REFERENCES ActivitySchedules(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE SET NULL
      )
    `);
    console.log('Table ActivityAttendance created/verified.');

    // 3. PatientVitals — Pencatatan tensi & tanda vital
    await connection.query(`
      CREATE TABLE IF NOT EXISTS PatientVitals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        recorded_date DATE NOT NULL,
        recorded_time TIME NULL,
        systolic INT NULL COMMENT 'Tekanan darah sistolik (mmHg)',
        diastolic INT NULL COMMENT 'Tekanan darah diastolik (mmHg)',
        pulse INT NULL COMMENT 'Nadi (bpm)',
        spo2 DECIMAL(5,2) NULL COMMENT 'Saturasi oksigen (%)',
        temperature DECIMAL(4,1) NULL COMMENT 'Suhu tubuh (°C)',
        weight DECIMAL(5,2) NULL COMMENT 'Berat badan (kg)',
        notes TEXT NULL,
        recorded_by_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
        INDEX idx_vitals_patient (patient_id),
        INDEX idx_vitals_date (recorded_date)
      )
    `);
    console.log('Table PatientVitals created/verified.');

    // 4. PatientConditions — Catatan kondisi pasien
    await connection.query(`
      CREATE TABLE IF NOT EXISTS PatientConditions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        condition_date DATE NOT NULL,
        severity ENUM('Baik', 'Sedang', 'Perlu Perhatian', 'Kritis') DEFAULT 'Sedang',
        description TEXT NOT NULL,
        actions_taken TEXT NULL,
        follow_up TEXT NULL,
        recorded_by_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
        INDEX idx_conditions_patient (patient_id),
        INDEX idx_conditions_date (condition_date)
      )
    `);
    console.log('Table PatientConditions created/verified.');

    // 5. FinanceIncome — Pencatatan dana masuk
    await connection.query(`
      CREATE TABLE IF NOT EXISTS FinanceIncome (
        id INT AUTO_INCREMENT PRIMARY KEY,
        income_date DATE NOT NULL,
        source VARCHAR(255) NOT NULL COMMENT 'Sumber dana: Donasi, YBM, Zakat, dll',
        category ENUM('Donasi','Infaq','Zakat','Wakaf','Dana YBM','Lainnya') DEFAULT 'Lainnya',
        amount DECIMAL(15,2) NOT NULL,
        description TEXT NULL,
        receipt_number VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        INDEX idx_income_date (income_date)
      )
    `);
    console.log('Table FinanceIncome created/verified.');

    // 6. FinanceExpenses — Pengeluaran operasional
    await connection.query(`
      CREATE TABLE IF NOT EXISTS FinanceExpenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expense_date DATE NOT NULL,
        category ENUM('Operasional','Konsumsi','Transportasi','Kesehatan','Utilitas','Gaji','Lainnya') DEFAULT 'Lainnya',
        description TEXT NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        payment_method ENUM('Tunai','Transfer','Lainnya') DEFAULT 'Tunai',
        receipt_number VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        INDEX idx_expense_date (expense_date)
      )
    `);
    console.log('Table FinanceExpenses created/verified.');

    console.log('\n✅ Semua tabel baru berhasil dibuat/diverifikasi!');
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
