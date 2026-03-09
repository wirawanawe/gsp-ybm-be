require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateAuditColumns() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'gsp_ybm',
        });

        console.log('Connected to database.');

        const tables = [
            'Users',
            'Patients',
            'PatientRegistrations',
            'Documents',
            'Visitors',
            'Rooms',
            'Beds',
            'Ambulances',
            'StayLogs',
            'StayLogVisitors',
            'AmbulanceLogs',
            'AmbulanceLogPatients',
        ];

        for (const table of tables) {
            // Check if columns already exist
            const [cols] = await connection.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN ('created_by', 'updated_by')`,
                [process.env.DB_NAME || 'gsp_ybm', table]
            );

            const existingCols = cols.map(c => c.COLUMN_NAME);

            if (!existingCols.includes('created_by')) {
                await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN created_by INT NULL`);
                console.log(`  [${table}] added created_by`);
                // Add FK only if Users table is not the same table (avoid self-ref issues on Users)
                try {
                    await connection.query(
                        `ALTER TABLE \`${table}\` ADD CONSTRAINT fk_${table.toLowerCase()}_created_by FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL`
                    );
                } catch (fkErr) {
                    console.log(`  [${table}] FK created_by skipped: ${fkErr.message}`);
                }
            } else {
                console.log(`  [${table}] created_by already exists`);
            }

            if (!existingCols.includes('updated_by')) {
                await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN updated_by INT NULL`);
                console.log(`  [${table}] added updated_by`);
                try {
                    await connection.query(
                        `ALTER TABLE \`${table}\` ADD CONSTRAINT fk_${table.toLowerCase()}_updated_by FOREIGN KEY (updated_by) REFERENCES Users(id) ON DELETE SET NULL`
                    );
                } catch (fkErr) {
                    console.log(`  [${table}] FK updated_by skipped: ${fkErr.message}`);
                }
            } else {
                console.log(`  [${table}] updated_by already exists`);
            }
        }

        console.log('\nMigration completed successfully.');
    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Connection closed.');
        }
        process.exit(0);
    }
}

migrateAuditColumns();
