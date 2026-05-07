const db = require('../config/db');

/** GET /api/account-codes */
exports.getAccountCodes = async (req, res) => {
    try {
        const { type, is_active } = req.query;
        let sql = 'SELECT * FROM AccountCodes WHERE 1=1';
        const params = [];

        if (type) {
            sql += ' AND (type = ? OR type = "Both")';
            params.push(type);
        }
        if (is_active !== undefined) {
            sql += ' AND is_active = ?';
            params.push(is_active === 'true' ? 1 : 0);
        }

        sql += ' ORDER BY code ASC';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getAccountCodes error:', err);
        res.status(500).json({ message: 'Gagal mengambil data kode akun' });
    }
};

/** POST /api/account-codes */
exports.createAccountCode = async (req, res) => {
    try {
        const { code, name, type, is_active } = req.body;
        if (!code || !name || !type) {
            return res.status(400).json({ message: 'code, name, dan type wajib diisi' });
        }

        const [result] = await db.query(
            `INSERT INTO AccountCodes (code, name, type, is_active, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [code, name, type, is_active !== undefined ? is_active : 1, req.user?.id || null]
        );

        const [rows] = await db.query('SELECT * FROM AccountCodes WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Kode akun sudah ada' });
        }
        console.error('createAccountCode error:', err);
        res.status(500).json({ message: 'Gagal menyimpan kode akun' });
    }
};

/** PUT /api/account-codes/:id */
exports.updateAccountCode = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, type, is_active } = req.body;

        const [check] = await db.query('SELECT id FROM AccountCodes WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });

        await db.query(
            `UPDATE AccountCodes SET
             code=?, name=?, type=?, is_active=?, updated_by=?
             WHERE id=?`,
            [code, name, type, is_active !== undefined ? is_active : 1, req.user?.id || null, id]
        );

        const [rows] = await db.query('SELECT * FROM AccountCodes WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Kode akun sudah ada' });
        }
        console.error('updateAccountCode error:', err);
        res.status(500).json({ message: 'Gagal update kode akun' });
    }
};

/** DELETE /api/account-codes/:id */
exports.deleteAccountCode = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if used in transactions (optional, but good practice)
        // For now, just delete
        await db.query('DELETE FROM AccountCodes WHERE id = ?', [id]);
        res.json({ message: 'Kode akun dihapus' });
    } catch (err) {
        console.error('deleteAccountCode error:', err);
        res.status(500).json({ message: 'Gagal menghapus kode akun' });
    }
};
