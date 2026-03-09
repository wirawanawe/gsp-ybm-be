const db = require('../config/db');

// GET /api/visitors
// Optional query: ?patient_id=123 — mengembalikan SEMUA penunggu pasien (termasuk is_active=0 agar data lama bisa dipilih lagi saat check-in)
exports.getVisitors = async (req, res) => {
    const { patient_id } = req.query;
    try {
        let query = `
      SELECT v.*, p.name AS patient_name
      FROM Visitors v
      JOIN Patients p ON v.patient_id = p.id
    `;
        const params = [];

        if (patient_id) {
            query += ' WHERE v.patient_id = ? ORDER BY v.is_active DESC, v.id DESC';
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

    // NIK dan no. telepon tidak boleh sama (di tabel Penunggu maupun Pasien)
    const nikTrim = String(nik).trim();
    const phoneTrim = phone ? String(phone).trim() : null;
    const [existingV] = await db.query(
        'SELECT id, nik, phone FROM Visitors WHERE nik = ? OR (? IS NOT NULL AND phone = ?)',
        [nikTrim, phoneTrim, phoneTrim]
    );
    if (existingV.length > 0) {
        if (existingV.some((r) => String(r.nik) === nikTrim)) {
            return res.status(400).json({ message: 'No. KTP (NIK) sudah terdaftar sebagai penunggu.' });
        }
        return res.status(400).json({ message: 'No. telepon sudah terdaftar sebagai penunggu.' });
    }
    if (phoneTrim) {
        const [existingP] = await db.query(
            'SELECT id FROM Patients WHERE nik = ? OR phone = ?',
            [nikTrim, phoneTrim]
        );
        if (existingP.length > 0) {
            return res.status(400).json({ message: 'No. KTP atau No. telepon sudah terdaftar sebagai pasien.' });
        }
    } else {
        const [existingP] = await db.query('SELECT id FROM Patients WHERE nik = ?', [nikTrim]);
        if (existingP.length > 0) {
            return res.status(400).json({ message: 'No. KTP sudah terdaftar sebagai pasien.' });
        }
    }

    const ktp_path = req.files && req.files['ktp'] ? req.files['ktp'][0].path : null;
    const kk_path = req.files && req.files['kk'] ? req.files['kk'][0].path : null;

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE WHERE patient_id = ?',
                [patient_id]
            );

            const [result] = await connection.query(
                'INSERT INTO Visitors (patient_id, name, nik, relation, phone, ktp_path, kk_path, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)',
                [patient_id, name, nik, relation, phone || null, ktp_path, kk_path, req.user?.id || null]
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

    // Jika NIK atau telepon diubah, tidak boleh sama dengan penunggu lain atau pasien (kecuali diri sendiri)
    if (nik !== undefined || phone !== undefined) {
        const [current] = await db.query('SELECT nik, phone FROM Visitors WHERE id = ?', [id]);
        if (current.length > 0) {
            const checkNik = nik !== undefined ? String(nik).trim() : current[0].nik;
            const checkPhone = phone !== undefined ? (phone ? String(phone).trim() : null) : (current[0].phone || null);
            const [dupV] = await db.query(
                'SELECT id, nik, phone FROM Visitors WHERE id != ? AND (nik = ? OR (? IS NOT NULL AND phone = ?))',
                [id, checkNik, checkPhone, checkPhone]
            );
            if (dupV.length > 0) {
                if (dupV.some((r) => String(r.nik) === checkNik)) {
                    return res.status(400).json({ message: 'No. KTP (NIK) sudah terdaftar sebagai penunggu.' });
                }
                return res.status(400).json({ message: 'No. telepon sudah terdaftar sebagai penunggu.' });
            }
            if (checkPhone) {
                const [dupP] = await db.query('SELECT id FROM Patients WHERE nik = ? OR phone = ?', [checkNik, checkPhone]);
                if (dupP.length > 0) {
                    return res.status(400).json({ message: 'No. KTP atau No. telepon sudah terdaftar sebagai pasien.' });
                }
            } else {
                const [dupP] = await db.query('SELECT id FROM Patients WHERE nik = ?', [checkNik]);
                if (dupP.length > 0) {
                    return res.status(400).json({ message: 'No. KTP sudah terdaftar sebagai pasien.' });
                }
            }
        }
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
        updates.push('updated_by = ?');
        params.push(req.user?.id || null);
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
