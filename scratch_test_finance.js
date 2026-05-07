const db = require('./src/config/db');

async function test() {
    try {
        const limit = 100;
        let sql = 'SELECT * FROM FinanceExpenses WHERE 1=1';
        const params = [];
        sql += ' ORDER BY expense_date DESC, id DESC LIMIT ?';
        params.push(Number(limit));
        console.log('SQL:', sql);
        console.log('Params:', params);
        const [rows] = await db.query(sql, params);
        console.log('Success, rows:', rows.length);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
