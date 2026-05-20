const db = require('../config/db');

/** GET /api/presence-categories */
exports.getPresenceCategories = async (req, res) => {
    try {
        const { is_active } = req.query;
        let sql = 'SELECT * FROM PresenceCategories WHERE 1=1';
        const params = [];

        if (is_active !== undefined) {
            sql += ' AND is_active = ?';
            params.push(is_active === 'true' ? 1 : 0);
        }

        sql += ' ORDER BY name ASC';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getPresenceCategories error:', err);
        res.status(500).json({ message: 'Gagal mengambil data kategori peserta' });
    }
};

/** POST /api/presence-categories */
exports.createPresenceCategory = async (req, res) => {
    try {
        const { name, description, is_active } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Nama kategori wajib diisi' });
        }

        const [result] = await db.query(
            `INSERT INTO PresenceCategories (name, description, is_active, created_by)
             VALUES (?, ?, ?, ?)`,
            [name, description || null, is_active !== undefined ? is_active : 1, req.user?.id || null]
        );

        const [rows] = await db.query('SELECT * FROM PresenceCategories WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Kategori peserta sudah ada' });
        }
        console.error('createPresenceCategory error:', err);
        res.status(500).json({ message: 'Gagal menyimpan kategori peserta' });
    }
};

/** PUT /api/presence-categories/:id */
exports.updatePresenceCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, is_active } = req.body;

        const [check] = await db.query('SELECT id FROM PresenceCategories WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });

        await db.query(
            `UPDATE PresenceCategories SET
             name=?, description=?, is_active=?, updated_by=?
             WHERE id=?`,
            [name, description || null, is_active !== undefined ? is_active : 1, req.user?.id || null, id]
        );

        const [rows] = await db.query('SELECT * FROM PresenceCategories WHERE id = ?', [id]);
        res.json(rows[0]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Kategori peserta sudah ada' });
        }
        console.error('updatePresenceCategory error:', err);
        res.status(500).json({ message: 'Gagal update kategori peserta' });
    }
};

/** DELETE /api/presence-categories/:id */
exports.deletePresenceCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM PresenceCategories WHERE id = ?', [id]);
        res.json({ message: 'Kategori peserta dihapus' });
    } catch (err) {
        console.error('deletePresenceCategory error:', err);
        res.status(500).json({ message: 'Gagal menghapus kategori peserta' });
    }
};
