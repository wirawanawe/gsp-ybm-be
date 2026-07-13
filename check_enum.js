const db = require('./src/config/db');

async function main() {
    try {
        const [columns] = await db.query(`SHOW COLUMNS FROM PatientRegistrations LIKE 'status_verification'`);
        if (columns.length > 0) {
            console.log('status_verification type:', columns[0].Type);
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

main();
