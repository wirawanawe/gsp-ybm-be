const db = require('../config/db');

// GET /api/roles
exports.getRoles = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Roles ORDER BY created_at ASC');
        res.json(rows);
    } catch (error) {
        console.error('getRoles error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data role' });
    }
};

// GET /api/roles/:id
exports.getRoleById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM Roles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Role tidak ditemukan' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('getRoleById error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data role' });
    }
};

// POST /api/roles
exports.createRole = async (req, res) => {
    const { name, accessible_menus } = req.body;

    if (!name || !accessible_menus) {
        return res.status(400).json({ message: 'Nama dan menus wajib diisi' });
    }

    try {
        const accessibleMenusJson = typeof accessible_menus === 'string' ? accessible_menus : JSON.stringify(accessible_menus);
        const [result] = await db.query(
            'INSERT INTO Roles (name, accessible_menus) VALUES (?, ?)',
            [name, accessibleMenusJson]
        );
        res.status(201).json({ message: 'Role berhasil dibuat', id: result.insertId });
    } catch (error) {
        console.error('createRole error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nama role sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat membuat role' });
    }
};

// PUT /api/roles/:id
exports.updateRole = async (req, res) => {
    const { id } = req.params;
    const { name, accessible_menus } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM Roles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Role tidak ditemukan' });
        }

        const current = rows[0];
        const newName = name || current.name;
        
        let newMenus = current.accessible_menus;
        if (accessible_menus !== undefined) {
            newMenus = typeof accessible_menus === 'string' ? accessible_menus : JSON.stringify(accessible_menus);
        }

        const [result] = await db.query(
            'UPDATE Roles SET name = ?, accessible_menus = ? WHERE id = ?',
            [newName, newMenus, id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ message: 'Tidak ada perubahan yang disimpan' });
        }

        res.json({ message: 'Role berhasil diupdate' });
    } catch (error) {
        console.error('updateRole error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nama role sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengupdate role' });
    }
};

// DELETE /api/roles/:id
exports.deleteRole = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query('DELETE FROM Roles WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Role tidak ditemukan' });
        }
        res.json({ message: 'Role berhasil dihapus' });
    } catch (error) {
        console.error('deleteRole error:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: 'Role ini sedang digunakan oleh user' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghapus role' });
    }
};
