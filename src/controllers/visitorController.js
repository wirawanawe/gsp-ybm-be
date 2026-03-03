const db = require('../config/db');

// GET /api/visitors
// Optional query: ?patient_id=123
exports.getVisitors = async (req, res) => {
    const { patient_id } = req.query;
    try {
        let query = `
      SELECT v.*, p.name as patient_name, p.registration_number
      FROM Visitors v
      JOIN Patients p ON v.patient_id = p.id
    `;
        const params = [];

        if (patient_id) {
            query += ' WHERE v.patient_id = ?';
            params.push(patient_id);
        }

        const [visitors] = await db.query(query, params);
        res.json(visitors);
    } catch (error) {
        console.error('getVisitors error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

const isValidNIK = (nik) => /^\d{16}$/.test(String(nik || '').trim());

// POST /api/visitors
// Mendukung registrasi lengkap (dengan KTP/KK) atau sederhana (hanya NIK, Nama, No HP, Hubungan)
exports.createVisitor = async (req, res) => {
    const { patient_id, name, nik, relation, phone } = req.body;

    if (!isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    const ktp_path = req.files && req.files['ktp'] ? req.files['ktp'][0].path : null;
    const kk_path = req.files && req.files['kk'] ? req.files['kk'][0].path : null;

    // KTP/KK opsional - untuk registrasi sederhana penunggu
    const hasDocs = ktp_path && kk_path;

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE WHERE patient_id = ?',
                [patient_id]
            );

            const [result] = await connection.query(
                'INSERT INTO Visitors (patient_id, name, nik, relation, phone, ktp_path, kk_path, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)',
                [patient_id, name, nik, relation, phone || null, ktp_path, kk_path]
            );

            await connection.commit();
            res.status(201).json({ message: 'Penunggu berhasil didaftarkan', id: result.insertId });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('createVisitor error:', error);
        res.status(500).json({ message: 'Gagal menambahkan penunggu pasien' });
    }
};

// PUT /api/visitors/:id
// Update data penunggu dan (opsional) ganti berkas KTP/KK
exports.updateVisitor = async (req, res) => {
    const { id } = req.params;
    const { name, nik, relation, phone } = req.body;

    if (nik && !isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    try {
        const updates = [];
        const params = [];

        const fields = { name, nik, relation, phone };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                updates.push(`${key} = ?`);
                params.push(value === '' ? null : value);
            }
        }

        const ktp_path = req.files && req.files['ktp'] ? req.files['ktp'][0].path : null;
        const kk_path = req.files && req.files['kk'] ? req.files['kk'][0].path : null;
        if (ktp_path) {
            updates.push('ktp_path = ?');
            params.push(ktp_path);
        }
        if (kk_path) {
            updates.push('kk_path = ?');
            params.push(kk_path);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Tidak ada data yang diupdate' });
        }
        params.push(id);

        const [result] = await db.query(
            `UPDATE Visitors SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Penunggu tidak ditemukan' });
        }
        res.json({ message: 'Data penunggu berhasil diupdate' });
    } catch (error) {
        console.error('updateVisitor error:', error);
        res.status(500).json({ message: 'Gagal mengupdate penunggu' });
    }
};

// DELETE /api/visitors/:id
exports.deleteVisitor = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM Visitors WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Penunggu tidak ditemukan' });
        }
        res.json({ message: 'Penunggu berhasil dihapus' });
    } catch (error) {
        console.error('deleteVisitor error:', error);
        res.status(500).json({ message: 'Gagal menghapus penunggu' });
    }
};
