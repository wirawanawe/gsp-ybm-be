const db = require('../config/db');
const fs = require('fs');
const path = require('path');

/** GET /api/hero-sliders (Public) */
exports.getPublicSliders = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM HeroSliders WHERE is_active = 1 ORDER BY order_number ASC, created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('getPublicSliders error:', err);
        res.status(500).json({ message: 'Gagal mengambil data slider' });
    }
};

/** GET /api/hero-sliders (Protected) */
exports.getAllSliders = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM HeroSliders ORDER BY order_number ASC, created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('getAllSliders error:', err);
        res.status(500).json({ message: 'Gagal mengambil data slider' });
    }
};

/** POST /api/hero-sliders */
exports.createSlider = async (req, res) => {
    try {
        const { title, subtitle, button_text, button_link, order_number, is_active } = req.body;
        const file = req.file;

        if (!title || !file) {
            return res.status(400).json({ message: 'Title dan Gambar wajib diisi' });
        }

        const image_url = `/uploads/${file.filename}`;

        const [result] = await db.query(
            `INSERT INTO HeroSliders (title, subtitle, image_url, button_text, button_link, order_number, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, subtitle || null, image_url, button_text || null, button_link || null, order_number || 0, is_active ?? 1]
        );

        const [rows] = await db.query('SELECT * FROM HeroSliders WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createSlider error:', err);
        res.status(500).json({ message: 'Gagal menambah slider' });
    }
};

/** PUT /api/hero-sliders/:id */
exports.updateSlider = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, button_text, button_link, order_number, is_active } = req.body;
        const file = req.file;

        let sql = 'UPDATE HeroSliders SET title=?, subtitle=?, button_text=?, button_link=?, order_number=?, is_active=?';
        let params = [title, subtitle || null, button_text || null, button_link || null, order_number || 0, is_active ?? 1];

        if (file) {
            const image_url = `/uploads/${file.filename}`;
            sql += ', image_url=?';
            params.push(image_url);

            // Optional: delete old image file
            const [old] = await db.query('SELECT image_url FROM HeroSliders WHERE id = ?', [id]);
            if (old.length && old[0].image_url) {
                const oldPath = path.join(__dirname, '../../', old[0].image_url);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        sql += ' WHERE id=?';
        params.push(id);

        await db.query(sql, params);
        const [rows] = await db.query('SELECT * FROM HeroSliders WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Slider tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        console.error('updateSlider error:', err);
        res.status(500).json({ message: 'Gagal mengupdate slider' });
    }
};

/** DELETE /api/hero-sliders/:id */
exports.deleteSlider = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT image_url FROM HeroSliders WHERE id = ?', [id]);
        
        if (!rows.length) return res.status(404).json({ message: 'Slider tidak ditemukan' });

        const imageUrl = rows[0].image_url;
        const filePath = path.join(__dirname, '../../', imageUrl);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await db.query('DELETE FROM HeroSliders WHERE id = ?', [id]);
        res.json({ message: 'Slider berhasil dihapus' });
    } catch (err) {
        console.error('deleteSlider error:', err);
        res.status(500).json({ message: 'Gagal menghapus slider' });
    }
};
