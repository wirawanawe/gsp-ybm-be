require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    let connection;
    try {
        const dbName = process.env.DB_NAME || 'gsp_ybm';
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: dbName
        });

        console.log('Connected to MySQL server.');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS PresenceCategories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_by INT NULL,
                updated_by INT NULL
            )
        `);
        console.log('Table PresenceCategories ensured.');

        // Insert some default data if empty
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM PresenceCategories');
        if (rows[0].count === 0) {
            await connection.query(`
                INSERT INTO PresenceCategories (name, description, is_active) VALUES 
                ('Umum', 'Peserta dari kategori umum', 1),
                ('Pasien', 'Peserta dari kategori pasien rumah singgah', 1),
                ('Penunggu', 'Peserta dari kategori penunggu pasien', 1)
            `);
            console.log('Default PresenceCategories inserted.');
        }

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('MySQL connection closed.');
        }
        process.exit(0);
    }
}

migrate();
