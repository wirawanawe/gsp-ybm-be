require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateRoles() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'gsp_ybm'
        });

        console.log('Connected to Database. Starting migration...');

        // 1. Create Roles table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                accessible_menus TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table Roles created/ensured.');

        // 2. Modify Users table role column (drop ENUM if possible)
        // Check if role is ENUM or VARCHAR
        const [columns] = await connection.query(`SHOW COLUMNS FROM Users LIKE 'role'`);
        if (columns.length > 0 && columns[0].Type.includes('enum')) {
            await connection.query(`ALTER TABLE Users MODIFY COLUMN role VARCHAR(255) NOT NULL`);
            console.log('Users.role column modified to VARCHAR(255).');
        } else {
            console.log('Users.role already modified or not an enum.');
        }

        // 3. Seed initial Roles
        const allMenus = [
            '/dashboard/reports',
            '/dashboard/register',
            '/dashboard/screening',
            '/dashboard/patients',
            '/dashboard/pendaftar',
            '/dashboard/visitors',
            '/dashboard/rooms',
            '/dashboard/ambulance',
            '/dashboard/settings',
            '/dashboard/kegiatan/tahsin',
            '/dashboard/kegiatan/taklim',
            '/dashboard/kegiatan/harian',
            '/dashboard/kegiatan/presensi',
            '/dashboard/kesehatan/tensi',
            '/dashboard/kesehatan/kondisi',
            '/dashboard/keuangan/pemasukan',
            '/dashboard/keuangan/pengeluaran',
            '/dashboard/keuangan/laporan',
            '/dashboard/keuangan/rekap'
        ];

        const frontDeskMenus = [
            '/dashboard/register',
            '/dashboard/screening',
            '/dashboard/pendaftar',
            '/dashboard/rooms',
            '/dashboard/kegiatan/tahsin',
            '/dashboard/kegiatan/taklim',
            '/dashboard/kegiatan/harian',
            '/dashboard/kegiatan/presensi',
            '/dashboard/kesehatan/tensi',
            '/dashboard/kesehatan/kondisi',
            '/dashboard/keuangan/pemasukan',
            '/dashboard/keuangan/pengeluaran',
            '/dashboard/keuangan/laporan',
            '/dashboard/keuangan/rekap'
        ];

        const sistemPengelolaMenus = [
            '/dashboard/screening',
            '/dashboard/patients',
            '/dashboard/pendaftar',
            '/dashboard/visitors',
            '/dashboard/rooms',
            '/dashboard/ambulance',
            '/dashboard/kegiatan/tahsin',
            '/dashboard/kegiatan/taklim',
            '/dashboard/kegiatan/harian',
            '/dashboard/kegiatan/presensi',
            '/dashboard/kesehatan/tensi',
            '/dashboard/kesehatan/kondisi',
            '/dashboard/keuangan/pemasukan',
            '/dashboard/keuangan/pengeluaran',
            '/dashboard/keuangan/laporan',
            '/dashboard/keuangan/rekap'
        ];

        const seedRoles = [
            { name: 'Admin YBM', menus: allMenus },
            { name: 'Petugas Front Desk', menus: frontDeskMenus },
            { name: 'Sistem Pengelola', menus: sistemPengelolaMenus }
        ];

        for (const roleDef of seedRoles) {
            const menusJson = JSON.stringify(roleDef.menus);
            const [rows] = await connection.query('SELECT id FROM Roles WHERE name = ?', [roleDef.name]);
            if (rows.length === 0) {
                await connection.query('INSERT INTO Roles (name, accessible_menus) VALUES (?, ?)', [
                    roleDef.name,
                    menusJson
                ]);
                console.log(`Seeded role: ${roleDef.name}`);
            } else {
                // Optionally update
                await connection.query('UPDATE Roles SET accessible_menus = ? WHERE name = ?', [
                    menusJson,
                    roleDef.name
                ]);
                console.log(`Updated role: ${roleDef.name}`);
            }
        }

        console.log('Migration successfully completed.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        if (connection) {
            await connection.end();
        }
        process.exit(0);
    }
}

migrateRoles();
