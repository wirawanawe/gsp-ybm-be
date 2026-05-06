const db = require('./src/config/db');

async function testInsert() {
    try {
        const regNum = 'TEST-' + Date.now();
        const [result] = await db.query(
            `INSERT INTO Patients (registration_number, name, nik, dob, gender, address, phone, age, age_category, education, disease_category)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [regNum, 'Test Persistence', '1234567890123456', '1990-01-01', 'Laki-laki', 'Test Address', '081234567890', 34, 'Dewasa', 'S1', 'None']
        );
        console.log('Inserted patient with ID:', result.insertId);
        
        const [rows] = await db.query('SELECT * FROM Patients WHERE id = ?', [result.insertId]);
        console.log('Retrieved patient:', rows[0]);
        
        await db.query('DELETE FROM Patients WHERE id = ?', [result.insertId]);
        console.log('Cleaned up test patient.');
        
        process.exit(0);
    } catch (err) {
        console.error('Test insert failed:', err);
        process.exit(1);
    }
}

testInsert();
