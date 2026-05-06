const db = require('./src/config/db');
async function check() {
    try {
        const [rows] = await db.query("DESCRIBE PatientRegistrations");
        console.log(rows.map(r => r.Field));
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
check();
