const db = require('../config/db');
const ExcelJS = require('exceljs');

// ─── INCOME ───────────────────────────────────────────────────────────────────

/** GET /api/finance/income */
exports.getIncome = async (req, res) => {
    try {
        const { date_from, date_to, category, limit = 100 } = req.query;
        let sql = 'SELECT * FROM FinanceIncome WHERE 1=1';
        const params = [];
        if (date_from) { sql += ' AND income_date >= ?'; params.push(date_from); }
        if (date_to)   { sql += ' AND income_date <= ?'; params.push(date_to); }
        if (category)  { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY income_date DESC, id DESC LIMIT ?';
        params.push(Number(limit));
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getIncome error:', err);
        res.status(500).json({ message: 'Gagal mengambil data pemasukan' });
    }
};

/** POST /api/finance/income */
exports.createIncome = async (req, res) => {
    try {
        const { income_date, source, category, amount, description, receipt_number, person_in_charge } = req.body;
        if (!income_date || !source || !amount) {
            return res.status(400).json({ message: 'income_date, source, dan amount wajib diisi' });
        }
        const [result] = await db.query(
            `INSERT INTO FinanceIncome
             (income_date, source, category, amount, description, receipt_number, person_in_charge, created_by)
             VALUES (?,?,?,?,?,?,?,?)`,
            [income_date, source, category || 'Lainnya', amount,
             description || null, receipt_number || null, person_in_charge || null, req.user?.id || null]
        );
        const [rows] = await db.query('SELECT * FROM FinanceIncome WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createIncome error:', err);
        res.status(500).json({ message: 'Gagal menyimpan pemasukan' });
    }
};

/** PUT /api/finance/income/:id */
exports.updateIncome = async (req, res) => {
    try {
        const { id } = req.params;
        const { income_date, source, category, amount, description, receipt_number, person_in_charge } = req.body;
        const [check] = await db.query('SELECT id FROM FinanceIncome WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });
        await db.query(
            `UPDATE FinanceIncome SET
             income_date=?, source=?, category=?, amount=?, description=?, receipt_number=?, person_in_charge=?, updated_by=?
             WHERE id=?`,
            [income_date, source, category, amount, description || null, receipt_number || null, person_in_charge || null, req.user?.id || null, id]
        );
        const [rows] = await db.query('SELECT * FROM FinanceIncome WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('updateIncome error:', err);
        res.status(500).json({ message: 'Gagal update pemasukan' });
    }
};

/** DELETE /api/finance/income/:id */
exports.deleteIncome = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM FinanceIncome WHERE id = ?', [id]);
        res.json({ message: 'Data pemasukan dihapus' });
    } catch (err) {
        console.error('deleteIncome error:', err);
        res.status(500).json({ message: 'Gagal menghapus pemasukan' });
    }
};

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

/** GET /api/finance/expenses */
exports.getExpenses = async (req, res) => {
    try {
        const { date_from, date_to, category, limit = 100 } = req.query;
        let sql = 'SELECT * FROM FinanceExpenses WHERE 1=1';
        const params = [];
        if (date_from) { sql += ' AND expense_date >= ?'; params.push(date_from); }
        if (date_to)   { sql += ' AND expense_date <= ?'; params.push(date_to); }
        if (category)  { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY expense_date DESC, id DESC LIMIT ?';
        params.push(Number(limit));
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getExpenses error:', err);
        res.status(500).json({ message: 'Gagal mengambil data pengeluaran' });
    }
};

/** POST /api/finance/expenses */
exports.createExpense = async (req, res) => {
    try {
        const { expense_date, category, description, amount, payment_method, receipt_number, person_in_charge, paid_to } = req.body;
        if (!expense_date || !description || !amount) {
            return res.status(400).json({ message: 'expense_date, description, dan amount wajib diisi' });
        }
        const [result] = await db.query(
            `INSERT INTO FinanceExpenses
             (expense_date, category, description, amount, payment_method, receipt_number, person_in_charge, paid_to, created_by)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [expense_date, category || 'Lainnya', description, amount,
             payment_method || 'Tunai', receipt_number || null, person_in_charge || null, paid_to || null, req.user?.id || null]
        );
        const [rows] = await db.query('SELECT * FROM FinanceExpenses WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createExpense error:', err);
        res.status(500).json({ message: 'Gagal menyimpan pengeluaran' });
    }
};

/** PUT /api/finance/expenses/:id */
exports.updateExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const { expense_date, category, description, amount, payment_method, receipt_number, person_in_charge, paid_to } = req.body;
        const [check] = await db.query('SELECT id FROM FinanceExpenses WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });
        await db.query(
            `UPDATE FinanceExpenses SET
             expense_date=?, category=?, description=?, amount=?,
             payment_method=?, receipt_number=?, person_in_charge=?, paid_to=?, updated_by=?
             WHERE id=?`,
            [expense_date, category, description, amount,
             payment_method, receipt_number || null, person_in_charge || null, paid_to || null, req.user?.id || null, id]
        );
        const [rows] = await db.query('SELECT * FROM FinanceExpenses WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('updateExpense error:', err);
        res.status(500).json({ message: 'Gagal update pengeluaran' });
    }
};

/** DELETE /api/finance/expenses/:id */
exports.deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM FinanceExpenses WHERE id = ?', [id]);
        res.json({ message: 'Data pengeluaran dihapus' });
    } catch (err) {
        console.error('deleteExpense error:', err);
        res.status(500).json({ message: 'Gagal menghapus pengeluaran' });
    }
};

// ─── REPORT ───────────────────────────────────────────────────────────────────

/**
 * GET /api/finance/report?period=weekly|monthly|yearly&year=2025&month=4&week_start=2025-04-01
 * Mengembalikan: total_income, total_expense, saldo, breakdown per kategori, list transaksi
 */
exports.getReport = async (req, res) => {
    try {
        const { period = 'monthly', year, month, date_from, date_to } = req.query;
        let incomeWhere = '1=1';
        let expenseWhere = '1=1';
        const iParams = [];
        const eParams = [];

        const now = new Date();
        const y = parseInt(year || now.getFullYear());
        const m = parseInt(month || now.getMonth() + 1);

        if (period === 'monthly') {
            incomeWhere = 'YEAR(income_date) = ? AND MONTH(income_date) = ?';
            expenseWhere = 'YEAR(expense_date) = ? AND MONTH(expense_date) = ?';
            iParams.push(y, m); eParams.push(y, m);
        } else if (period === 'yearly') {
            incomeWhere = 'YEAR(income_date) = ?';
            expenseWhere = 'YEAR(expense_date) = ?';
            iParams.push(y); eParams.push(y);
        } else if (period === 'weekly' && date_from && date_to) {
            incomeWhere = 'income_date BETWEEN ? AND ?';
            expenseWhere = 'expense_date BETWEEN ? AND ?';
            iParams.push(date_from, date_to); eParams.push(date_from, date_to);
        } else if (date_from && date_to) {
            incomeWhere = 'income_date BETWEEN ? AND ?';
            expenseWhere = 'expense_date BETWEEN ? AND ?';
            iParams.push(date_from, date_to); eParams.push(date_from, date_to);
        }

        const [[{ total_income }]] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_income FROM FinanceIncome WHERE ${incomeWhere}`,
            iParams
        );
        const [[{ total_expense }]] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_expense FROM FinanceExpenses WHERE ${expenseWhere}`,
            eParams
        );

        // Breakdown income per category
        const [incomeByCategory] = await db.query(
            `SELECT category, SUM(amount) AS total FROM FinanceIncome
             WHERE ${incomeWhere} GROUP BY category ORDER BY total DESC`,
            iParams
        );

        // Breakdown expense per category
        const [expenseByCategory] = await db.query(
            `SELECT category, SUM(amount) AS total FROM FinanceExpenses
             WHERE ${expenseWhere} GROUP BY category ORDER BY total DESC`,
            eParams
        );

        // Recent transactions (income + expense merged, sorted by date)
        const [incomeList] = await db.query(
            `SELECT 'income' AS type, income_date AS trx_date, source AS description,
             category, amount, receipt_number, person_in_charge, null AS paid_to FROM FinanceIncome WHERE ${incomeWhere}
             ORDER BY income_date DESC LIMIT 200`,
            iParams
        );
        const [expenseList] = await db.query(
            `SELECT 'expense' AS type, expense_date AS trx_date, description,
             category, amount, receipt_number, person_in_charge, paid_to FROM FinanceExpenses WHERE ${expenseWhere}
             ORDER BY expense_date DESC LIMIT 200`,
            eParams
        );

        const transactions = [...incomeList, ...expenseList].sort((a, b) => {
            const numA = a.receipt_number || '';
            const numB = b.receipt_number || '';
            return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.json({
            period, year: y, month: m,
            summary: {
                total_income: Number(total_income),
                total_expense: Number(total_expense),
                saldo: Number(total_income) - Number(total_expense),
            },
            income_by_category: incomeByCategory,
            expense_by_category: expenseByCategory,
            transactions,
        });
    } catch (err) {
        console.error('getReport error:', err);
        res.status(500).json({ message: 'Gagal mengambil laporan keuangan' });
    }
};

/**
 * GET /api/finance/rekap?group_by=weekly|monthly|yearly&year=2025
 * Untuk chart rekap — kembalikan array per periode dengan total_income & total_expense
 */
exports.getRekap = async (req, res) => {
    try {
        const { group_by = 'monthly', year } = req.query;
        const now = new Date();
        const y = parseInt(year || now.getFullYear());

        let incomeSelect, expenseSelect;

        if (group_by === 'monthly') {
            incomeSelect = `SELECT MONTH(income_date) AS period_key, MONTHNAME(income_date) AS period_label,
                            SUM(amount) AS total FROM FinanceIncome
                            WHERE YEAR(income_date) = ${y} GROUP BY MONTH(income_date), MONTHNAME(income_date)`;
            expenseSelect = `SELECT MONTH(expense_date) AS period_key, MONTHNAME(expense_date) AS period_label,
                             SUM(amount) AS total FROM FinanceExpenses
                             WHERE YEAR(expense_date) = ${y} GROUP BY MONTH(expense_date), MONTHNAME(expense_date)`;
        } else if (group_by === 'yearly') {
            incomeSelect = `SELECT YEAR(income_date) AS period_key, YEAR(income_date) AS period_label,
                            SUM(amount) AS total FROM FinanceIncome
                            GROUP BY YEAR(income_date) ORDER BY period_key DESC LIMIT 5`;
            expenseSelect = `SELECT YEAR(expense_date) AS period_key, YEAR(expense_date) AS period_label,
                             SUM(amount) AS total FROM FinanceExpenses
                             GROUP BY YEAR(expense_date) ORDER BY period_key DESC LIMIT 5`;
        } else {
            // weekly — ambil 12 minggu terakhir
            incomeSelect = `SELECT WEEK(income_date, 1) AS period_key,
                            CONCAT('Minggu ', WEEK(income_date, 1)) AS period_label,
                            SUM(amount) AS total FROM FinanceIncome
                            WHERE income_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
                            GROUP BY WEEK(income_date, 1) ORDER BY period_key DESC LIMIT 12`;
            expenseSelect = `SELECT WEEK(expense_date, 1) AS period_key,
                             CONCAT('Minggu ', WEEK(expense_date, 1)) AS period_label,
                             SUM(amount) AS total FROM FinanceExpenses
                             WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
                             GROUP BY WEEK(expense_date, 1) ORDER BY period_key DESC LIMIT 12`;
        }

        const [incomeRows] = await db.query(incomeSelect);
        const [expenseRows] = await db.query(expenseSelect);

        // Merge by period_key
        const map = {};
        for (const r of incomeRows) {
            map[r.period_key] = { period_key: r.period_key, period_label: r.period_label, total_income: Number(r.total), total_expense: 0 };
        }
        for (const r of expenseRows) {
            if (!map[r.period_key]) map[r.period_key] = { period_key: r.period_key, period_label: r.period_label, total_income: 0, total_expense: 0 };
            map[r.period_key].total_expense = Number(r.total);
        }
        const rekap = Object.values(map).sort((a, b) => a.period_key - b.period_key);

        res.json({ group_by, year: y, rekap });
    } catch (err) {
        console.error('getRekap error:', err);
        res.status(500).json({ message: 'Gagal mengambil rekap keuangan' });
    }
};

/**
 * GET /api/finance/export?period=monthly|yearly|weekly&year=2025&month=4...
 * Export Laporan Keuangan ke Excel dengan styling
 */
exports.exportExcel = async (req, res) => {
    try {
        const { period = 'monthly', year, month, date_from, date_to } = req.query;
        let incomeWhere = '1=1';
        let expenseWhere = '1=1';
        const iParams = [];
        const eParams = [];

        const now = new Date();
        const y = parseInt(year || now.getFullYear());
        const m = parseInt(month || now.getMonth() + 1);

        if (period === 'monthly') {
            incomeWhere = 'YEAR(income_date) = ? AND MONTH(income_date) = ?';
            expenseWhere = 'YEAR(expense_date) = ? AND MONTH(expense_date) = ?';
            iParams.push(y, m); eParams.push(y, m);
        } else if (period === 'yearly') {
            incomeWhere = 'YEAR(income_date) = ?';
            expenseWhere = 'YEAR(expense_date) = ?';
            iParams.push(y); eParams.push(y);
        } else if (period === 'weekly' && date_from && date_to) {
            incomeWhere = 'income_date BETWEEN ? AND ?';
            expenseWhere = 'expense_date BETWEEN ? AND ?';
            iParams.push(date_from, date_to); eParams.push(date_from, date_to);
        }

        const [incomeList] = await db.query(
            `SELECT 'income' AS type, income_date AS trx_date, source AS description,
             category, amount, receipt_number, person_in_charge, null AS paid_to FROM FinanceIncome WHERE ${incomeWhere}
             ORDER BY receipt_number ASC`,
            iParams
        );
        const [expenseList] = await db.query(
            `SELECT 'expense' AS type, expense_date AS trx_date, description,
             category, amount, receipt_number, person_in_charge, paid_to FROM FinanceExpenses WHERE ${expenseWhere}
             ORDER BY receipt_number ASC`,
            eParams
        );

        const transactions = [...incomeList, ...expenseList].sort((a, b) => {
            const numA = a.receipt_number || '';
            const numB = b.receipt_number || '';
            return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Keuangan');

        sheet.columns = [
            { header: 'Tanggal', key: 'date', width: 15 },
            { header: 'No Bukti', key: 'receipt', width: 15 },
            { header: 'Uraian/Penjelasan', key: 'description', width: 40 },
            { header: 'Dibayar Kepada', key: 'paid_to', width: 25 },
            { header: 'Kategori', key: 'category', width: 20 },
            { header: 'Debit (Masuk)', key: 'debit', width: 18 },
            { header: 'Kredit (Keluar)', key: 'kredit', width: 18 },
            { header: 'Saldo', key: 'saldo', width: 18 }
        ];

        let cumulativeSaldo = 0;
        let totalDebit = 0;
        let totalKredit = 0;
        transactions.forEach(t => {
            const isIncome = t.type === 'income';
            const incomeAmt = isIncome ? Number(t.amount) : 0;
            const expenseAmt = !isIncome ? Number(t.amount) : 0;
            cumulativeSaldo = cumulativeSaldo + incomeAmt - expenseAmt;
            totalDebit += incomeAmt;
            totalKredit += expenseAmt;

            sheet.addRow({
                date: t.trx_date ? new Date(t.trx_date).toLocaleDateString('id-ID') : '-',
                receipt: t.receipt_number || '-',
                description: t.description || '-',
                paid_to: t.paid_to || '-',
                category: t.category || '-',
                debit: incomeAmt > 0 ? incomeAmt : '',
                kredit: expenseAmt > 0 ? expenseAmt : '',
                saldo: cumulativeSaldo
            });
        });

        // Tambah baris total di paling bawah
        const totalRow = sheet.addRow({
            description: 'Total',
            debit: totalDebit,
            kredit: totalKredit
        });

        // Styling
        const headerRow = sheet.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEE6F0' } };
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
                
                // Alignment based on column
                if ([1, 2, 5].includes(colNumber)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else if ([6, 7, 8].includes(colNumber)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    cell.numFmt = '#,##0';
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                }
            });
        });

        // Styling khusus untuk baris total (bold dan teks 'Total' di tengah)
        totalRow.font = { bold: true };
        totalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_Keuangan_${period}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('exportExcel error:', err);
        res.status(500).json({ message: 'Gagal mengekspor laporan keuangan' });
    }
};
