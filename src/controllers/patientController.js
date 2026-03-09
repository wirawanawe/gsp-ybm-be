const db = require('../config/db');

// GET /api/patients/pending-count
// Untuk notifikasi sidebar - jumlah pasien Pending verifikasi
exports.getPendingCount = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT COUNT(*) AS count FROM PatientRegistrations WHERE status_verification = 'Pending'"
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
            `SELECT p.id, p.name, p.nik, p.dob, p.gender, p.address, p.phone, p.registration_number,
                    p.rt_rw, p.kelurahan, p.kecamatan, p.kabupaten, p.provinsi,
                    p.diagnosis, p.treatment_plan, p.occupation, p.income,
                    (SELECT pr.status_mustahik FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_mustahik,
                    (SELECT pr.status_verification FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_verification,
                    EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) AS sudah_pulang,
                    (SELECT COUNT(*) FROM PatientRegistrations pr WHERE pr.patient_id = p.id) AS jumlah_registrasi
             FROM Patients p WHERE p.nik = ? ORDER BY p.created_at DESC LIMIT 1`,
            [nik.trim()]
        );
        if (rows.length === 0) {
            return res.json(null);
        }
        const patient = rows[0];
        const ditolak = (patient.status_verification || '') === 'Rujukan Lain';
        const sudahPulang = !!patient.sudah_pulang;
        const tidakPunyaRegistrasi = (patient.jumlah_registrasi || 0) === 0;
        const canReRegister = tidakPunyaRegistrasi || ditolak || sudahPulang;

        let reason = '';
        if (canReRegister) {
            reason = tidakPunyaRegistrasi ? 'Pasien belum punya data registrasi, dapat mendaftar.' : (ditolak && sudahPulang ? 'Pasien pernah ditolak dan sudah pulang' : ditolak ? 'Pasien pernah ditolak' : 'Pasien sudah checkout/pulang');
        } else {
            reason = 'Pasien masih dalam data pendaftar. Belum dapat mendaftar ulang. Hanya pasien yang sudah checkout/pulang atau ditolak yang dapat mendaftar kembali.';
        }

        res.json({
            ...patient,
            can_re_register: canReRegister,
            can_re_register_reason: reason
        });
    } catch (error) {
        console.error('getPatientByNik error:', error);
        res.status(500).json({ message: 'Gagal mencari pasien' });
    }
};

// GET /api/patients/applicants
// Data Pendaftar: satu baris per REGISTRASI (PatientRegistrations), sehingga pasien yang sama bisa muncul
// beberapa kali dengan no. registrasi berbeda. Pasien tanpa riwayat di PatientRegistrations tetap muncul sekali (data lama).
// exclude_occupied=1: untuk dropdown check-in, hanya yang belum menempati bed (Menunggu).
exports.getApplicants = async (req, res) => {
    const { exclude_occupied } = req.query;
    try {
        const [rows] = await db.query(
            `SELECT p.id, p.name, p.nik, p.phone, p.created_at,
                pr.id AS registration_id,
                COALESCE(pr.registration_number, p.registration_number) AS registration_number,
                COALESCE(pr.created_at, p.created_at) AS registration_created_at,
                pr.status_verification,
                pr.status_mustahik,
                COALESCE(pr.status_rumah_singgah, CASE
                    WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NULL) THEN 'Dirawat'
                    WHEN EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) THEN 'Sudah Pulang'
                    ELSE 'Menunggu'
                END) AS status_rumah_singgah,
                (SELECT MAX(s.check_out_date) FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) AS check_out_date
             FROM Patients p
             LEFT JOIN PatientRegistrations pr ON pr.patient_id = p.id
             WHERE COALESCE(pr.status_verification, 'Pending') = 'Layak Mustahik'
             ORDER BY COALESCE(pr.created_at, p.created_at) DESC`
        );
        // Untuk registrasi dengan status Menunggu/Dirawat, tanggal checkout dikosongkan (bukan data checkout sebelumnya)
        rows.forEach((r) => {
            if ((r.status_rumah_singgah || '') !== 'Sudah Pulang') {
                r.check_out_date = null;
            }
        });
        if (exclude_occupied === '1' || exclude_occupied === 'true') {
            const [occupied] = await db.query(
                'SELECT DISTINCT patient_id FROM StayLogs WHERE final_status IS NULL'
            );
            const occupiedIds = new Set(occupied.map(r => r.patient_id));
            const filtered = rows.filter(r => !occupiedIds.has(r.id));
            return res.json(filtered);
        }
        res.json(rows);
    } catch (error) {
        console.error('getApplicants error:', error);
        res.status(500).json({ message: 'Gagal mengambil data pendaftar' });
    }
};

// GET /api/patients
// Data Pasien: Rekap seluruh pasien. status_verification dari PatientRegistrations (registrasi terakhir).
// exclude_occupied=1: exclude pasien yang punya StayLog aktif (sedang menempati bed)
exports.getPatients = async (req, res) => {
    const { status, exclude_occupied } = req.query; // e.g., ?status=Pending&exclude_occupied=1
    try {
        let query = `SELECT p.*,
            (SELECT pr.status_verification FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_verification,
            (SELECT pr.status_mustahik FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_mustahik
            FROM Patients p`;
        const params = [];

        if (status && status !== 'ALL') {
            if (status === 'Sudah Pulang') {
                query = `SELECT p.*,
                    (SELECT pr.status_verification FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_verification,
                    (SELECT pr.status_mustahik FROM PatientRegistrations pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS status_mustahik
                    FROM Patients p
                    WHERE EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL)`;
            } else {
                query += ' WHERE EXISTS(SELECT 1 FROM PatientRegistrations pr WHERE pr.patient_id = p.id AND pr.status_verification = ?)';
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
                'INSERT INTO Documents (patient_id, document_type, file_path, created_by) VALUES (?, ?, ?, ?)',
                [patientId, docEnum, file.path, req.user?.id || null]
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
    const {
        name, nik, dob, gender, address, phone, status_mustahik,
        rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
        diagnosis, treatment_plan, occupation, income
    } = req.body;

    if (!isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    try {
        const nikTrim = String(nik).trim();
        const phoneTrim = String(phone || '').trim();
        // NIK dan no. telepon tidak boleh sama (di tabel Pasien maupun Penunggu)
        const [existingP] = await db.query(
            'SELECT id, nik, phone FROM Patients WHERE nik = ? OR phone = ?',
            [nikTrim, phoneTrim]
        );
        if (existingP.length > 0) {
            if (existingP.some((r) => String(r.nik) === nikTrim)) {
                return res.status(400).json({ message: 'No. KTP (NIK) sudah terdaftar. Jika ini pasien yang sama, gunakan pendaftaran ulang.' });
            }
            return res.status(400).json({ message: 'No. telepon sudah terdaftar.' });
        }
        const [existingV] = await db.query(
            'SELECT id FROM Visitors WHERE nik = ? OR (phone IS NOT NULL AND phone = ?)',
            [nikTrim, phoneTrim]
        );
        if (existingV.length > 0) {
            return res.status(400).json({ message: 'No. KTP atau No. telepon sudah terdaftar sebagai penunggu.' });
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Generate registration number: REG-YBM-YYYYMMDDHHMMSS
            const regNum = `REG-YBM-${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}`;

            // 1. Insert ke tabel Patients (tanpa status - ada di PatientRegistrations)
            const userId = req.user?.id || null;
            const [patientResult] = await connection.query(
                `INSERT INTO Patients (registration_number, name, nik, dob, gender, address, phone,
                 rt_rw, kelurahan, kecamatan, kabupaten, provinsi, diagnosis, treatment_plan, occupation, income, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [regNum, name, nik, dob, gender, address, phone,
                    rt_rw || null, kelurahan || null, kecamatan || null, kabupaten || null, provinsi || null,
                    diagnosis || null, treatment_plan || null, occupation || null, income || null, userId]
            );

            const patientId = patientResult.insertId;

            // 2. Catat di PatientRegistrations (riwayat registrasi + status)
            await connection.query(
                `INSERT INTO PatientRegistrations (patient_id, registration_number, status_mustahik, status_verification, status_rumah_singgah, created_by)
                 VALUES (?, ?, ?, 'Pending', 'Menunggu', ?)`,
                [patientId, regNum, status_mustahik || 'Mustahik', userId]
            );

            // 3. Insert ke tabel Documents (jika ada file yang diunggah)
            if (req.files) {
                const docTypes = Object.keys(req.files);
                for (const type of docTypes) {
                    const file = req.files[type][0];
                    // Determine logical document_type enum value
                    let docEnum = type.toUpperCase();

                    await connection.query(
                        `INSERT INTO Documents (patient_id, document_type, file_path, created_by) VALUES (?, ?, ?, ?)`,
                        [patientId, docEnum, file.path, userId]
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
// Pendaftaran ulang: TIDAK menambah baris di Patients. Hanya menambah baris di PatientRegistrations.
// Pasien yang sama akan muncul lagi di Data Pendaftar dengan no. registrasi baru (satu baris per registrasi).
exports.reRegister = async (req, res) => {
    const patientId = req.params.id;
    const {
        name, dob, gender, address, phone, status_mustahik,
        rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
        diagnosis, treatment_plan, occupation, income
    } = req.body;

    try {
        const [patients] = await db.query('SELECT id FROM Patients WHERE id = ?', [patientId]);
        if (patients.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        const regNum = `REG-YBM-${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}`;

        // Setiap pendaftaran ulang: status verifikasi di-reset (Pending), status_rumah_singgah selalu Menunggu (episode baru)
        const userId = req.user?.id || null;
        await db.query(
            `INSERT INTO PatientRegistrations (patient_id, registration_number, status_mustahik, status_verification, status_rumah_singgah, created_by)
             VALUES (?, ?, ?, 'Pending', 'Menunggu', ?)`,
            [patientId, regNum, (status_mustahik && ['Mustahik', 'Non-Mustahik'].includes(status_mustahik)) ? status_mustahik : 'Mustahik', userId]
        );

        // Opsional: update data pasien dari form (nama, alamat, dll.) tanpa menambah baris (status ada di PatientRegistrations)
        const updates = [];
        const params = [];
        const fields = {
            name, dob, gender, address, phone,
            rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
            diagnosis, treatment_plan, occupation, income
        };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== '') {
                updates.push(`${key} = ?`);
                params.push(value);
            }
        }
        if (updates.length > 0) {
            updates.push('updated_by = ?');
            params.push(userId);
            params.push(patientId);
            await db.query(
                `UPDATE Patients SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }

        res.status(201).json({
            message: 'Pendaftaran ulang berhasil. No. registrasi baru akan muncul di Data Pendaftar.',
            registration_number: regNum,
            patient_id: Number(patientId)
        });
    } catch (error) {
        console.error('reRegister error:', error);
        res.status(500).json({ message: 'Gagal melakukan pendaftaran ulang' });
    }
};

// PUT /api/patients/:id
// Update data pasien (untuk koreksi saat screening - data awal mungkin belum valid)
exports.updatePatient = async (req, res) => {
    const { id } = req.params;
    const {
        name, nik, dob, gender, address, phone, status_mustahik,
        rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
        diagnosis, treatment_plan, occupation, income
    } = req.body;

    if (nik !== undefined && !isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    // Jika NIK atau no. telepon diubah, tidak boleh sama dengan data lain (pasien lain atau penunggu)
    if (nik !== undefined || phone !== undefined) {
        const [current] = await db.query('SELECT nik, phone FROM Patients WHERE id = ?', [id]);
        if (current.length > 0) {
            const checkNik = nik !== undefined ? String(nik).trim() : current[0].nik;
            const checkPhone = phone !== undefined ? String(phone || '').trim() : (current[0].phone || '');
            const [dupP] = await db.query(
                'SELECT id FROM Patients WHERE id != ? AND (nik = ? OR phone = ?)',
                [id, checkNik, checkPhone]
            );
            if (dupP.length > 0) {
                const [byNik] = await db.query('SELECT id FROM Patients WHERE id != ? AND nik = ?', [id, checkNik]);
                if (byNik.length > 0) {
                    return res.status(400).json({ message: 'No. KTP (NIK) sudah terdaftar untuk pasien lain.' });
                }
                return res.status(400).json({ message: 'No. telepon sudah terdaftar untuk pasien lain.' });
            }
            const [dupV] = await db.query(
                'SELECT id FROM Visitors WHERE nik = ? OR (phone IS NOT NULL AND phone = ?)',
                [checkNik, checkPhone]
            );
            if (dupV.length > 0) {
                return res.status(400).json({ message: 'No. KTP atau No. telepon sudah terdaftar sebagai penunggu.' });
            }
        }
    }

    try {
        const updates = [];
        const params = [];

        const fields = {
            name, nik, dob, gender, address, phone,
            rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
            diagnosis, treatment_plan, occupation, income
        };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                updates.push(`${key} = ?`);
                params.push(value === '' ? null : value);
            }
        }
        if (updates.length === 0) {
            return res.status(400).json({ message: 'Tidak ada data yang diupdate' });
        }
        updates.push('updated_by = ?');
        params.push(req.user?.id || null);
        params.push(id);
        await db.query(
            `UPDATE Patients SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        res.json({ message: 'Data pasien berhasil diupdate' });
    } catch (error) {
        console.error('updatePatient error:', error);
        res.status(500).json({ message: 'Gagal mengupdate data pasien' });
    }
};

// DELETE /api/patients/:id
// Hapus pasien beserta dokumen & penunggu terkait (mengikuti constraint di database)
exports.deletePatient = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM Patients WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }
        res.json({ message: 'Pasien berhasil dihapus' });
    } catch (error) {
        console.error('deletePatient error:', error);
        res.status(500).json({ message: 'Gagal menghapus pasien' });
    }
};

// PUT /api/patients/:id/verify
// Update status_verification di SEMUA baris PatientRegistrations untuk pasien ini.
exports.verifyPatient = async (req, res) => {
    const { status_verification } = req.body;
    const allowed = ['Layak Mustahik', 'Rujukan Lain'];
    if (!status_verification || !allowed.includes(status_verification)) {
        return res.status(400).json({ message: 'status_verification harus Layak Mustahik atau Rujukan Lain' });
    }

    try {
        const [result] = await db.query(
            'UPDATE PatientRegistrations SET status_verification = ?, updated_by = ? WHERE patient_id = ?',
            [status_verification, req.user?.id || null, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan atau belum punya data registrasi' });
        }

        res.json({ message: `Status pasien berhasil diupdate menjadi ${status_verification}`, status_verification });
    } catch (error) {
        console.error('verifyPatient error:', error);
        res.status(500).json({ message: 'Gagal verifikasi pasien' });
    }
};
