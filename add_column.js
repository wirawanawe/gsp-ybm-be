const db = require('./src/config/db');

async function main() {
    try {
        const [columns] = await db.query(`SHOW COLUMNS FROM PatientRegistrations LIKE 'cancellation_reason'`);
        if (columns.length === 0) {
            console.log('Adding cancellation_reason column...');
            await db.query(`ALTER TABLE PatientRegistrations ADD COLUMN cancellation_reason TEXT`);
            console.log('Column added successfully.');
        } else {
            console.log('Column cancellation_reason already exists.');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

main();
