const db = require('../config/db');

// GET /api/patients/pending-count
// Untuk notifikasi sidebar - jumlah pasien Pending verifikasi
exports.getPendingCount = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT COUNT(*) AS count FROM Patients WHERE status_verification = 'Pending'"
        );
        const count = rows[0]?.count ?? 0;
        res.json({ count: Number(count) });
    } catch (error) {
        console.error('getPendingCount error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server', count: 0 });
    }
};

// GET /api/patients/by-nik?nik=1234567890123456
// Ambil data pasien berdasarkan NIK (untuk pre-fill form pendaftaran ulang)
// Hanya pasien yang sudah checkout/pulang atau ditolak yang bisa mendaftar ulang
exports.getPatientByNik = async (req, res) => {
    const { nik } = req.query;
    if (!nik || !/^\d{16}$/.test(String(nik).trim())) {
        return res.status(400).json({ message: 'NIK harus 16 digit' });
    }
    try {
        const [rows] = await db.query(
            `SELECT p.id, p.name, p.nik, p.dob, p.gender, p.address, p.phone, p.status_mustahik, p.registration_number, p.status_verification,
                    EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) AS sudah_pulang
             FROM Patients p WHERE p.nik = ? ORDER BY p.created_at DESC LIMIT 1`,
            [nik.trim()]
        );
        if (rows.length === 0) {
            return res.json(null);
        }
        const patient = rows[0];
        const ditolak = patient.status_verification === 'Rujukan Lain';
        const sudahPulang = !!patient.sudah_pulang;
        const canReRegister = ditolak || sudahPulang;

        res.json({
            ...patient,
            can_re_register: canReRegister,
            can_re_register_reason: canReRegister
                ? (ditolak && sudahPulang ? 'Pasien pernah ditolak dan sudah pulang' : ditolak ? 'Pasien pernah ditolak' : 'Pasien sudah checkout/pulang')
                : 'Pasien masih dalam data pendaftar. Belum dapat mendaftar ulang. Hanya pasien yang sudah checkout/pulang atau ditolak yang dapat mendaftar kembali.'
        });
    } catch (error) {
        console.error('getPatientByNik error:', error);
        res.status(500).json({ message: 'Gagal mencari pasien' });
    }
};

// GET /api/patients/applicants
// Data Pendaftar: semua Layak Mustahik (Menunggu, Dirawat, Sudah Pulang). Termasuk tanggal checkout.
// exclude_occupied=1: untuk dropdown check-in, hanya yang belum menempati bed (Menunggu).
exports.getApplicants = async (req, res) => {
    const { exclude_occupied } = req.query;
    try {
        const [rows] = await db.query(
            `SELECT p.*,
                CASE
                    WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NULL) THEN 'Dirawat'
                    WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) THEN 'Sudah Pulang'
                    ELSE 'Menunggu'
                END AS status_rumah_singgah,
                (SELECT MAX(s.check_out_date) FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) AS check_out_date
             FROM Patients p
             WHERE p.status_verification = 'Layak Mustahik'
             ORDER BY p.created_at DESC`
        );
        if (exclude_occupied === '1' || exclude_occupied === 'true') {
            const [occupied] = await db.query(
                'SELECT DISTINCT patient_id FROM StayLogs WHERE final_status IS NULL'
            );
            const occupiedIds = new Set(occupied.map(r => r.patient_id));
            const filtered = rows.filter(p => !occupiedIds.has(p.id));
            return res.json(filtered);
        }
        res.json(rows);
    } catch (error) {
        console.error('getApplicants error:', error);
        res.status(500).json({ message: 'Gagal mengambil data pendaftar' });
    }
};

// GET /api/patients
// Data Pasien: Rekap seluruh pasien. Digunakan saat pendaftaran (lookup by NIK).
// exclude_occupied=1: exclude pasien yang punya StayLog aktif (sedang menempati bed)
exports.getPatients = async (req, res) => {
    const { status, exclude_occupied } = req.query; // e.g., ?status=Pending&exclude_occupied=1
    try {
        let query = 'SELECT * FROM Patients p';
        const params = [];

        if (status && status !== 'ALL') {
            if (status === 'Sudah Pulang') {
                query = `SELECT p.* FROM Patients p
                    WHERE EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL)`;
            } else {
                query += ' WHERE p.status_verification = ?';
                params.push(status);
            }
        }
        query += ' ORDER BY p.created_at DESC';

        const [patients] = await db.query(query, params);

        // Exclude pasien yang punya StayLog aktif (sedang menempati bed)
        if (exclude_occupied === '1' || exclude_occupied === 'true') {
            const [occupied] = await db.query(
                'SELECT DISTINCT patient_id FROM StayLogs WHERE final_status IS NULL'
            );
            const occupiedIds = new Set(occupied.map(r => r.patient_id));
            const filtered = patients.filter(p => !occupiedIds.has(p.id));
            return res.json(filtered);
        }

        res.json(patients);
    } catch (error) {
        console.error('getPatients error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// POST /api/patients/:id/documents
// Susulan dokumen saat verifikasi (lokasi screening berbeda dengan pendaftaran)
exports.addPatientDocuments = async (req, res) => {
    const patientId = req.params.id;
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ message: 'Tidak ada file yang diunggah' });
    }
    try {
        const docTypes = Object.keys(req.files);
        for (const type of docTypes) {
            const file = req.files[type][0];
            const docEnum = type.toUpperCase();
            await db.query(
                'INSERT INTO Documents (patient_id, document_type, file_path) VALUES (?, ?, ?)',
                [patientId, docEnum, file.path]
            );
        }
        res.json({ message: 'Dokumen berhasil ditambahkan' });
    } catch (error) {
        console.error('addPatientDocuments error:', error);
        res.status(500).json({ message: 'Gagal menambahkan dokumen' });
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
const isValidNIK = (nik) => /^\d{16}$/.test(String(nik || '').trim());

exports.registerPatient = async (req, res) => {
    const { name, nik, dob, gender, address, phone, status_mustahik } = req.body;

    if (!isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

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
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nomor registrasi duplikat. Silakan coba lagi.' });
        }
        res.status(500).json({ message: 'Gagal melakukan registrasi' });
    }
};

// POST /api/patients/:id/re-register
// Pendaftaran ulang:
// - Membuat baris pasien BARU dengan nomor registrasi baru
// - Status verifikasi di-reset ke Pending
// - Riwayat stay & status lama tetap menempel ke pasien lama
// - Dokumen lama disalin ke pasien baru (supaya tidak perlu upload ulang)
exports.reRegister = async (req, res) => {
    const oldPatientId = req.params.id;
    const { name, dob, gender, address, phone, status_mustahik } = req.body;

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [patients] = await connection.query('SELECT * FROM Patients WHERE id = ?', [oldPatientId]);
            if (patients.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: 'Pasien tidak ditemukan' });
            }

            const existing = patients[0];

            // Generate registration number baru untuk pendaftaran ulang
            const regNum = `REG-YBM-${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}`;

            // Insert pasien baru (episode baru), nik tetap sama
            const [insertResult] = await connection.query(
                `INSERT INTO Patients (registration_number, name, nik, dob, gender, address, phone, status_mustahik, status_verification)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
                [
                    regNum,
                    name || existing.name,
                    existing.nik,
                    dob || existing.dob,
                    gender || existing.gender,
                    address || existing.address,
                    phone || existing.phone,
                    status_mustahik || existing.status_mustahik || 'Mustahik'
                ]
            );

            const newPatientId = insertResult.insertId;

            // Salin dokumen lama ke pasien baru
            const [oldDocs] = await connection.query(
                'SELECT document_type, file_path FROM Documents WHERE patient_id = ?',
                [oldPatientId]
            );

            if (Array.isArray(oldDocs) && oldDocs.length > 0) {
                for (const doc of oldDocs) {
                    await connection.query(
                        'INSERT INTO Documents (patient_id, document_type, file_path) VALUES (?, ?, ?)',
                        [newPatientId, doc.document_type, doc.file_path]
                    );
                }
            }

            // Tambah dokumen baru jika ada (override / tambahan)
            if (req.files && Object.keys(req.files).length > 0) {
                const docTypes = Object.keys(req.files);
                for (const type of docTypes) {
                    const file = req.files[type][0];
                    const docEnum = type.toUpperCase();
                    await connection.query(
                        'INSERT INTO Documents (patient_id, document_type, file_path) VALUES (?, ?, ?)',
                        [newPatientId, docEnum, file.path]
                    );
                }
            }

            await connection.commit();
            connection.release();

            res.status(201).json({
                message: 'Pendaftaran ulang berhasil',
                registration_number: regNum,
                patient_id: Number(newPatientId)
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('reRegister error:', error);
        res.status(500).json({ message: 'Gagal melakukan pendaftaran ulang' });
    }
};

// PUT /api/patients/:id/verify
// Endpoint Admin klik "Layak Mustahik" atau "Rujukan Lain". Setelah Layak Mustahik, pasien muncul di Data Pendaftar.
exports.verifyPatient = async (req, res) => {
    const { status_verification } = req.body;
    const allowed = ['Layak Mustahik', 'Rujukan Lain'];
    if (!status_verification || !allowed.includes(status_verification)) {
        return res.status(400).json({ message: 'status_verification harus Layak Mustahik atau Rujukan Lain' });
    }

    try {
        const [result] = await db.query(
            'UPDATE Patients SET status_verification = ? WHERE id = ?',
            [status_verification, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        res.json({ message: `Status pasien berhasil diupdate menjadi ${status_verification}`, status_verification });
    } catch (error) {
        console.error('verifyPatient error:', error);
        res.status(500).json({ message: 'Gagal verifikasi pasien' });
    }
};
