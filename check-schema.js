const db = require('./src/config/db');

async function describeTables() {
    try {
        const [patients] = await db.query('DESCRIBE Patients');
        console.log('--- Patients Table ---');
        console.table(patients);

        const [visitors] = await db.query('DESCRIBE Visitors');
        console.log('--- Visitors Table ---');
        console.table(visitors);

        const [stayLogs] = await db.query('DESCRIBE StayLogs');
        console.log('--- StayLogs Table ---');
        console.table(stayLogs);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

describeTables();
