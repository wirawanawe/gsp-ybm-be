const db = require('./src/config/db');
async function check() {
    try {
        const [rows] = await db.query("SELECT id, name, disease_category FROM Patients");
        console.log(rows);
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
check();
