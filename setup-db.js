require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
  let connection;
  try {
    // Connect to MySQL server without selecting a database first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    console.log('Connected to MySQL server.');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'gsp_ybm';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`Database '${dbName}' ensured.`);

    // Switch to the database
    await connection.query(`USE \`${dbName}\``);

    // Create Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('Admin YBM', 'Petugas Front Desk', 'Sistem Pengelola') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Table Users created.');

    // Create Patients table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        registration_number VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        nik VARCHAR(24) NOT NULL,
        dob DATE NOT NULL,
        gender ENUM('Laki-laki', 'Perempuan') NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(30) NOT NULL,
        status_mustahik ENUM('Mustahik', 'Non-Mustahik') NOT NULL,
        status_verification ENUM('Pending', 'Layak Mustahik', 'Rujukan Lain') DEFAULT 'Pending',
        rt_rw VARCHAR(50), kelurahan VARCHAR(100), kecamatan VARCHAR(100),
        kabupaten VARCHAR(100), provinsi VARCHAR(100),
        diagnosis TEXT, treatment_plan TEXT, occupation VARCHAR(100), income VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Table Patients created.');

    // Create Documents table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        document_type ENUM('KTP', 'KK', 'BPJS', 'SKTM', 'Rujukan', 'Foto') NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE
      )
    `);
    console.log('Table Documents created.');

    // Create Visitors table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Visitors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        nik VARCHAR(24) NOT NULL,
        relation VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        ktp_path VARCHAR(255),
        kk_path VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE
      )
    `);
    console.log('Table Visitors created.');

    // Create Rooms table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_number VARCHAR(50) NOT NULL UNIQUE,
        floor INT NOT NULL,
        capacity INT NOT NULL,
        description TEXT
      )
    `);
    console.log('Table Rooms created.');

    // Create Beds table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Beds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        bed_number VARCHAR(50) NOT NULL,
        bed_type VARCHAR(50),
        is_available BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (room_id) REFERENCES Rooms(id) ON DELETE CASCADE
      )
    `);
    console.log('Table Beds created.');

    // Create Ambulances table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Ambulances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plate_number VARCHAR(20) NOT NULL UNIQUE,
        vehicle_model VARCHAR(100) NOT NULL,
        status ENUM('Available', 'In-Journey', 'Maintenance') DEFAULT 'Available'
      )
    `);
    console.log('Table Ambulances created.');

    // Create StayLogs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS StayLogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        bed_id INT,
        check_in_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        check_out_date TIMESTAMP NULL,
        final_status ENUM('Sembuh', 'Rujukan Lanjut', 'Meninggal', 'Transfer') NULL,
        transfer_reason TEXT NULL,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
        FOREIGN KEY (bed_id) REFERENCES Beds(id) ON DELETE SET NULL
      )
    `);
    console.log('Table StayLogs created.');

    // Create AmbulanceLogs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS AmbulanceLogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ambulance_id INT NOT NULL,
        patient_id INT,
        destination TEXT NOT NULL,
        departure_time TIMESTAMP NOT NULL,
        return_time TIMESTAMP NULL,
        status ENUM('In-Journey', 'Completed', 'Cancelled') DEFAULT 'In-Journey',
        FOREIGN KEY (ambulance_id) REFERENCES Ambulances(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE SET NULL
      )
    `);
    console.log('Table AmbulanceLogs created.');

    // Seed Data (Admin User)
    const bcrypt = require('bcrypt');
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const [rows] = await connection.query(`SELECT id FROM Users WHERE email = 'admin@gsp.com'`);
    if (rows.length === 0) {
      await connection.query(`
        INSERT INTO Users (name, email, password_hash, role)
        VALUES ('Admin Utama', 'admin@gsp.com', ?, 'Admin YBM')
      `, [adminPasswordHash]);
      console.log('Seed: Admin user created (admin@gsp.com / admin123).');
    }

    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection closed.');
    }
    process.exit(0);
  }
}

setupDatabase();
