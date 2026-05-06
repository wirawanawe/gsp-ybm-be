const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('Starting migration: adding age to Patients table...');

        // 1. Add age to Patients
        await db.query(`
            ALTER TABLE Patients 
            ADD COLUMN age INT AFTER dob
        `);
        console.log('Added age to Patients table.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
