const db = require('./src/config/db');

async function main() {
    try {
        await db.query(`ALTER TABLE PatientRegistrations MODIFY COLUMN status_verification ENUM('Pending','Layak Mustahik','Rujukan Lain','Batal') DEFAULT 'Pending'`);
        console.log('ENUM updated successfully.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

main();
