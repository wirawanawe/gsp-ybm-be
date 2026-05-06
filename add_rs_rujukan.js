const db = require('./src/config/db');
async function migrate() {
    try {
        await db.query("ALTER TABLE Patients ADD COLUMN rs_rujukan VARCHAR(255) NULL");
        console.log("Migration successful");
    } catch(err) {
        if(err.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists");
        } else {
            console.error(err);
        }
    } finally {
        process.exit();
    }
}
migrate();
