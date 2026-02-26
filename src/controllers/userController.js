const bcrypt = require('bcrypt');
const db = require('../config/db');

// GET /api/users
exports.getUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, email, role, created_at FROM Users ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('getUsers error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data user' });
    }
};

// GET /api/users/:id
exports.getUserById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            'SELECT id, name, email, role, created_at FROM Users WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('getUserById error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data user' });
    }
};

// POST /api/users
exports.createUser = async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'Nama, email, password, dan role wajib diisi' });
    }

    try {
        const password_hash = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            'INSERT INTO Users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, password_hash, role]
        );

        res.status(201).json({ message: 'User berhasil dibuat', id: result.insertId });
    } catch (error) {
        console.error('createUser error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat membuat user' });
    }
};

// PUT /api/users/:id
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    try {
        // Ambil user lama
        const [rows] = await db.query('SELECT * FROM Users WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        const current = rows[0];
        const newName = name || current.name;
        const newEmail = email || current.email;
        const newRole = role || current.role;

        let newPasswordHash = current.password_hash;
        if (password) {
            newPasswordHash = await bcrypt.hash(password, 10);
        }

        const [result] = await db.query(
            'UPDATE Users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?',
            [newName, newEmail, newPasswordHash, newRole, id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ message: 'Tidak ada perubahan yang disimpan' });
        }

        res.json({ message: 'User berhasil diupdate' });
    } catch (error) {
        console.error('updateUser error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengupdate user' });
    }
};

// DELETE /api/users/:id
exports.deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query('DELETE FROM Users WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }
        res.json({ message: 'User berhasil dihapus' });
    } catch (error) {
        console.error('deleteUser error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghapus user' });
    }
};

