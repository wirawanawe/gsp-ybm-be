const db = require('../config/db');
const fs = require('fs');
const path = require('path');

/** GET /api/documentation */
exports.getDocumentation = async (req, res) => {
    try {
        const { type, activity_id } = req.query;
        let sql = 'SELECT d.*, s.title as activity_title FROM Documentation d LEFT JOIN ActivitySchedules s ON d.activity_id = s.id WHERE 1=1';
        const params = [];

        if (type) {
            sql += ' AND d.file_type = ?';
            params.push(type);
        }
        if (activity_id) {
            sql += ' AND d.activity_id = ?';
            params.push(activity_id);
        }

        sql += ' ORDER BY d.created_at DESC';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getDocumentation error:', err);
        res.status(500).json({ message: 'Gagal mengambil data dokumentasi' });
    }
};

/** POST /api/documentation */
exports.createDocumentation = async (req, res) => {
    try {
        const { title, description, file_type, activity_id } = req.body;
        const file = req.file;

        if (!title || !file_type || !file) {
            return res.status(400).json({ message: 'Title, file_type, dan file wajib diisi' });
        }

        const file_url = `/uploads/${file.filename}`;

        const [result] = await db.query(
            `INSERT INTO Documentation (title, description, file_url, file_type, activity_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, description || null, file_url, file_type, activity_id || null, req.user?.id || null]
        );

        const [rows] = await db.query('SELECT * FROM Documentation WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createDocumentation error:', err);
        res.status(500).json({ message: 'Gagal menambah dokumentasi' });
    }
};

/** PUT /api/documentation/:id */
exports.updateDocumentation = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, activity_id } = req.body;

        await db.query(
            `UPDATE Documentation SET title = ?, description = ?, activity_id = ? WHERE id = ?`,
            [title, description || null, activity_id || null, id]
        );

        const [rows] = await db.query('SELECT * FROM Documentation WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Dokumentasi tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        console.error('updateDocumentation error:', err);
        res.status(500).json({ message: 'Gagal mengupdate dokumentasi' });
    }
};

/** DELETE /api/documentation/:id */
exports.deleteDocumentation = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT file_url FROM Documentation WHERE id = ?', [id]);
        
        if (!rows.length) return res.status(404).json({ message: 'Dokumentasi tidak ditemukan' });

        const fileUrl = rows[0].file_url;
        const filePath = path.join(__dirname, '../../', fileUrl);

        // Delete file from filesystem
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await db.query('DELETE FROM Documentation WHERE id = ?', [id]);
        res.json({ message: 'Dokumentasi berhasil dihapus' });
    } catch (err) {
        console.error('deleteDocumentation error:', err);
        res.status(500).json({ message: 'Gagal menghapus dokumentasi' });
    }
};
