const db = require('./src/config/db');

async function testVisitorInsert() {
    try {
        const [result] = await db.query(
            `INSERT INTO Visitors (patient_id, name, nik, relation, phone, gender, dob, age, age_category, education, address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [7, 'Test Visitor Persistence', '9876543210987654', 'Teman', '081234567891', 'Laki-laki', '1995-05-05', 29, 'Dewasa', 'SMA', 'Test Visitor Address']
        );
        console.log('Inserted visitor with ID:', result.insertId);
        
        const [rows] = await db.query('SELECT * FROM Visitors WHERE id = ?', [result.insertId]);
        console.log('Retrieved visitor:', rows[0]);
        
        await db.query('DELETE FROM Visitors WHERE id = ?', [result.insertId]);
        console.log('Cleaned up test visitor.');
        
        process.exit(0);
    } catch (err) {
        console.error('Test visitor insert failed:', err);
        process.exit(1);
    }
}

testVisitorInsert();
