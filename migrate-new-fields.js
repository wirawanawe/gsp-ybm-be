const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('Starting migration: adding new fields to Patients and Visitors tables...');

        // 1. Add fields to Patients
        await db.query(`
            ALTER TABLE Patients 
            ADD COLUMN age_category VARCHAR(50) AFTER dob,
            ADD COLUMN education VARCHAR(100) AFTER age_category,
            ADD COLUMN disease_category VARCHAR(100) AFTER diagnosis
        `);
        console.log('Added age_category, education, disease_category to Patients table.');

        // 2. Add fields to Visitors (Sync with Patients)
        await db.query(`
            ALTER TABLE Visitors
            ADD COLUMN gender ENUM('Laki-laki', 'Perempuan') AFTER name,
            ADD COLUMN dob DATE AFTER gender,
            ADD COLUMN age INT AFTER dob,
            ADD COLUMN age_category VARCHAR(50) AFTER age,
            ADD COLUMN education VARCHAR(100) AFTER age_category,
            ADD COLUMN address TEXT AFTER phone,
            ADD COLUMN rt_rw VARCHAR(50) AFTER address,
            ADD COLUMN kelurahan VARCHAR(100) AFTER rt_rw,
            ADD COLUMN kecamatan VARCHAR(100) AFTER kelurahan,
            ADD COLUMN kabupaten VARCHAR(100) AFTER kecamatan,
            ADD COLUMN provinsi VARCHAR(100) AFTER kabupaten,
            ADD COLUMN occupation VARCHAR(100) AFTER provinsi,
            ADD COLUMN income VARCHAR(100) AFTER occupation
        `);
        console.log('Added gender, dob, age, age_category, education, address, and more to Visitors table.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
