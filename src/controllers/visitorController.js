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

// POST /api/visitors
exports.createVisitor = async (req, res) => {
    const { patient_id, name, nik, relation } = req.body;
    // Handling file paths saved from Multer (assuming middleware runs before this)
    const ktp_path = req.files['ktp'] ? req.files['ktp'][0].path : null;
    const kk_path = req.files['kk'] ? req.files['kk'][0].path : null;

    if (!ktp_path || !kk_path) {
        return res.status(400).json({ message: 'Dokumen KTP dan KK penunggu wajib diupload' });
    }

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Deactivate current active visitors for this patient
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE WHERE patient_id = ?',
                [patient_id]
            );

            // Create new active visitor
            const [result] = await connection.query(
                'INSERT INTO Visitors (patient_id, name, nik, relation, ktp_path, kk_path, is_active) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
                [patient_id, name, nik, relation, ktp_path, kk_path]
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
