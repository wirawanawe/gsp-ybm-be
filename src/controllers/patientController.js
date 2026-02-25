const db = require('../config/db');

// GET /api/patients
// Digunakan Admin untuk melihat daftar pasien baru (Pending) dll.
exports.getPatients = async (req, res) => {
    const { status } = req.query; // e.g., ?status=Pending
    try {
        let query = 'SELECT * FROM Patients ORDER BY created_at DESC';
        const params = [];

        if (status) {
            query = 'SELECT * FROM Patients WHERE status_verification = ? ORDER BY created_at DESC';
            params.push(status);
        }

        const [patients] = await db.query(query, params);
        res.json(patients);
    } catch (error) {
        console.error('getPatients error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// GET /api/patients/:id/documents
// Digunakan Admin untuk cek berkas
exports.getPatientDocuments = async (req, res) => {
    try {
        const [docs] = await db.query('SELECT * FROM Documents WHERE patient_id = ?', [req.params.id]);
        res.json(docs);
    } catch (error) {
        console.error('getPatientDocuments error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// POST /api/patients/register
// Endpoint pendaftaran pasien baru multi-part
exports.registerPatient = async (req, res) => {
    const { name, nik, dob, gender, address, phone, status_mustahik } = req.body;

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Generate registration number: REG-YBM-YYYYMMDDHHMMSS
            const regNum = `REG-YBM-${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}`;

            // 1. Insert ke tabel Patients
            const [patientResult] = await connection.query(
                `INSERT INTO Patients (registration_number, name, nik, dob, gender, address, phone, status_mustahik, status_verification)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
                [regNum, name, nik, dob, gender, address, phone, status_mustahik]
            );

            const patientId = patientResult.insertId;

            // 2. Insert ke tabel Documents (jika ada file yang diunggah)
            if (req.files) {
                const docTypes = Object.keys(req.files);
                for (const type of docTypes) {
                    const file = req.files[type][0];
                    // Determine logical document_type enum value
                    let docEnum = type.toUpperCase();

                    await connection.query(
                        `INSERT INTO Documents (patient_id, document_type, file_path) VALUES (?, ?, ?)`,
                        [patientId, docEnum, file.path]
                    );
                }
            }

            await connection.commit();
            res.status(201).json({
                message: 'Pendaftaran berhasil dikirim',
                registration_number: regNum,
                patient_id: patientId
            });

        } catch (err) {
            await connection.rollback();
            throw err; // Lempar ke catch blok di luar
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('registerPatient error:', error);
        // Cek Duplicate NIK
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'NIK atau Data sudah terdaftar sebelumnya' });
        }
        res.status(500).json({ message: 'Gagal melakukan registrasi' });
    }
};

// PUT /api/patients/:id/verify
// Endpoint Admin klik "Layak Mustahik" atau "Rujukan Lain"
exports.verifyPatient = async (req, res) => {
    const { status_verification } = req.body;
    // status valid: 'Layak Mustahik', 'Rujukan Lain'

    try {
        const [result] = await db.query(
            'UPDATE Patients SET status_verification = ? WHERE id = ?',
            [status_verification, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        res.json({ message: `Status pasien berhasil diupdate menjadi ${status_verification}` });
    } catch (error) {
        console.error('verifyPatient error:', error);
        res.status(500).json({ message: 'Gagal verifikasi pasien' });
    }
};
