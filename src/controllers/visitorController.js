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

// GET /api/visitors/by-nik?nik=1234567890123456
// Ambil data penunggu berdasarkan NIK untuk auto-fill (dari data penunggu lama atau dari riwayat pasien)
exports.getVisitorByNik = async (req, res) => {
    const { nik } = req.query;
    if (!nik || !/^\d{16}$/.test(String(nik).trim())) {
        return res.status(400).json({ message: 'NIK harus 16 digit' });
    }
    const nikTrim = String(nik).trim();
    try {
        // 1. Cek apakah NIK ini pasien yang sedang aktif dirawat di kamar/bed
        const [activePatient] = await db.query(
            `SELECT sl.id, p.name, r.room_number, b.bed_number
             FROM Patients p
             JOIN StayLogs sl ON sl.patient_id = p.id AND sl.final_status IS NULL
             LEFT JOIN Beds b ON sl.bed_id = b.id
             LEFT JOIN Rooms r ON b.room_id = r.id
             WHERE p.nik = ?
             LIMIT 1`,
            [nikTrim]
        );
        const isActivePatient = activePatient.length > 0;
        const activePatientStay = isActivePatient ? activePatient[0] : null;

        // 2. Cek apakah NIK ini sedang aktif mendampingi pasien di stay aktif
        const [activeVisitor] = await db.query(
            `SELECT sl.id, p.name AS patient_name, r.room_number, b.bed_number
             FROM Visitors v
             JOIN StayLogVisitors slv ON slv.visitor_id = v.id
             JOIN StayLogs sl ON slv.stay_log_id = sl.id AND sl.final_status IS NULL
             JOIN Patients p ON sl.patient_id = p.id
             LEFT JOIN Beds b ON sl.bed_id = b.id
             LEFT JOIN Rooms r ON b.room_id = r.id
             WHERE v.nik = ?
             LIMIT 1`,
            [nikTrim]
        );
        const isActiveVisitor = activeVisitor.length > 0;
        const activeVisitorStay = isActiveVisitor ? activeVisitor[0] : null;

        // 3. Cari di Visitors (terbaru)
        const [vRows] = await db.query(
            `SELECT v.*, p.name AS accompanied_patient_name
             FROM Visitors v
             LEFT JOIN Patients p ON v.patient_id = p.id
             WHERE v.nik = ?
             ORDER BY v.id DESC LIMIT 1`,
            [nikTrim]
        );

        // 4. Cari di Patients (terbaru)
        const [pRows] = await db.query(
            `SELECT p.*,
                    EXISTS(SELECT 1 FROM StayLogs s WHERE s.patient_id = p.id AND s.final_status IS NOT NULL) AS sudah_pulang
             FROM Patients p
             WHERE p.nik = ?
             ORDER BY p.id DESC LIMIT 1`,
            [nikTrim]
        );

        if (vRows.length === 0 && pRows.length === 0) {
            return res.json(null);
        }

        let source = '';
        let result = {};

        if (vRows.length > 0 && pRows.length === 0) {
            source = 'visitor';
            result = { ...vRows[0] };
        } else if (pRows.length > 0 && vRows.length === 0) {
            source = 'patient';
            result = { ...pRows[0] };
        } else {
            const vTime = new Date(vRows[0].updated_at || vRows[0].created_at || 0).getTime();
            const pTime = new Date(pRows[0].updated_at || pRows[0].created_at || 0).getTime();
            if (vTime >= pTime) {
                source = 'visitor';
                result = { ...vRows[0] };
            } else {
                source = 'patient';
                result = { ...pRows[0] };
            }
        }

        const canRegister = !isActivePatient && !isActiveVisitor;
        let reason = '';
        if (isActivePatient) {
            const roomInfo = activePatientStay.room_number ? ` di Kamar ${activePatientStay.room_number} Bed ${activePatientStay.bed_number}` : '';
            reason = `Pasien (${activePatientStay.name}) saat ini masih aktif dirawat${roomInfo}. Harus checkout terlebih dahulu sebelum dapat didaftarkan sebagai penunggu.`;
        } else if (isActiveVisitor) {
            const roomInfo = activeVisitorStay.room_number ? ` (Kamar ${activeVisitorStay.room_number} Bed ${activeVisitorStay.bed_number})` : '';
            reason = `Penunggu saat ini masih aktif mendampingi pasien ${activeVisitorStay.patient_name}${roomInfo}. Selesaikan checkout terlebih dahulu.`;
        } else if (source === 'patient') {
            reason = `Data ditemukan dari riwayat pasien (${result.name}). Data demografi telah diisi otomatis.`;
        } else {
            reason = `Data ditemukan dari riwayat penunggu sebelumnya (${result.name}). Data demografi telah diisi otomatis.`;
        }

        res.json({
            ...result,
            source,
            is_from_patient: source === 'patient',
            is_from_visitor: source === 'visitor',
            is_active_patient: isActivePatient,
            is_active_visitor: isActiveVisitor,
            can_register: canRegister,
            reason
        });
    } catch (error) {
        console.error('getVisitorByNik error:', error);
        res.status(500).json({ message: 'Gagal mencari data penunggu' });
    }
};

const isValidNIK = (nik) => /^\d{16}$/.test(String(nik || '').trim());

// POST /api/visitors
// Mendukung registrasi lengkap (dengan KTP/KK) atau sederhana (hanya NIK, Nama, No HP, Hubungan)
exports.createVisitor = async (req, res) => {
    const { 
        patient_id, name, nik, relation, phone,
        gender, dob, age, age_category, education,
        address, rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
        occupation, income
    } = req.body;

    if (!isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    const nikTrim = String(nik).trim();
    const phoneTrim = phone ? String(phone).trim() : null;

    try {
        // 1. Cek apakah NIK ini terdaftar sebagai pasien yang SEDANG AKTIF dirawat di kamar/bed
        const [activePatient] = await db.query(
            `SELECT sl.id, p.name, r.room_number, b.bed_number
             FROM Patients p
             JOIN StayLogs sl ON sl.patient_id = p.id AND sl.final_status IS NULL
             LEFT JOIN Beds b ON sl.bed_id = b.id
             LEFT JOIN Rooms r ON b.room_id = r.id
             WHERE p.nik = ?
             LIMIT 1`,
            [nikTrim]
        );
        if (activePatient.length > 0) {
            const stay = activePatient[0];
            const roomInfo = stay.room_number ? ` di Kamar ${stay.room_number} Bed ${stay.bed_number}` : '';
            return res.status(400).json({
                message: `No. KTP (NIK) terdaftar sebagai pasien (${stay.name}) yang saat ini masih aktif dirawat${roomInfo}. Pasien harus checkout terlebih dahulu sebelum dapat didaftarkan sebagai penunggu.`
            });
        }

        // 2. Cek apakah NIK ini saat ini masih tercatat aktif mendampingi pasien LAIN di stay aktif
        const [activeOtherStay] = await db.query(
            `SELECT sl.id, p.name AS patient_name, r.room_number, b.bed_number
             FROM Visitors v
             JOIN StayLogVisitors slv ON slv.visitor_id = v.id
             JOIN StayLogs sl ON slv.stay_log_id = sl.id AND sl.final_status IS NULL
             JOIN Patients p ON sl.patient_id = p.id
             LEFT JOIN Beds b ON sl.bed_id = b.id
             LEFT JOIN Rooms r ON b.room_id = r.id
             WHERE v.nik = ? AND v.patient_id != ?
             LIMIT 1`,
            [nikTrim, patient_id]
        );
        if (activeOtherStay.length > 0) {
            const stay = activeOtherStay[0];
            const roomInfo = stay.room_number ? ` (Kamar ${stay.room_number} Bed ${stay.bed_number})` : '';
            return res.status(400).json({
                message: `No. KTP (NIK) saat ini masih tercatat aktif mendampingi pasien lain (${stay.patient_name})${roomInfo}. Selesaikan checkout penunggu/pasien tersebut terlebih dahulu.`
            });
        }

        // 3. Cek berkas KTP/KK
        let ktp_path = req.files && req.files['ktp'] ? req.files['ktp'][0].path : null;
        let kk_path = req.files && req.files['kk'] ? req.files['kk'][0].path : null;

        // Jika tidak diunggah, coba reuse dari riwayat penunggu atau riwayat pasien sebelumnya
        if (!ktp_path || !kk_path) {
            const [prevV] = await db.query(
                'SELECT ktp_path, kk_path FROM Visitors WHERE nik = ? AND (ktp_path IS NOT NULL OR kk_path IS NOT NULL) ORDER BY id DESC LIMIT 1',
                [nikTrim]
            );
            if (prevV.length > 0) {
                if (!ktp_path && prevV[0].ktp_path) ktp_path = prevV[0].ktp_path;
                if (!kk_path && prevV[0].kk_path) kk_path = prevV[0].kk_path;
            }
            if (!ktp_path || !kk_path) {
                const [prevP] = await db.query(
                    `SELECT d.document_type, d.file_path
                     FROM Documents d
                     JOIN Patients p ON d.patient_id = p.id
                     WHERE p.nik = ? AND d.document_type IN ('KTP', 'KK')`,
                    [nikTrim]
                );
                for (const doc of prevP) {
                    if (!ktp_path && doc.document_type === 'KTP') ktp_path = doc.file_path;
                    if (!kk_path && doc.document_type === 'KK') kk_path = doc.file_path;
                }
            }
        }

        // 4. Cek apakah penunggu ini sudah terdaftar untuk pasien yang SAMA
        const [existingSame] = await db.query(
            'SELECT id FROM Visitors WHERE patient_id = ? AND nik = ?',
            [patient_id, nikTrim]
        );

        const cleanDob = (dob && String(dob).trim() !== '') ? String(dob).trim() : null;
        const cleanAge = (age !== undefined && age !== '' && !isNaN(Number(age))) ? Number(age) : null;
        const cleanAddress = (address && String(address).trim() !== '') ? String(address).trim() : null;

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE WHERE patient_id = ?',
                [patient_id]
            );

            let visitorId;
            if (existingSame.length > 0) {
                // Update data penunggu yang sudah ada untuk pasien ini
                visitorId = existingSame[0].id;
                await connection.query(
                    `UPDATE Visitors SET
                        name = ?, relation = ?, phone = ?, gender = ?, dob = ?, age = ?, age_category = ?, education = ?,
                        address = ?, rt_rw = ?, kelurahan = ?, kecamatan = ?, kabupaten = ?, provinsi = ?,
                        occupation = ?, income = ?,
                        ktp_path = COALESCE(?, ktp_path),
                        kk_path = COALESCE(?, kk_path),
                        is_active = TRUE,
                        updated_by = ?
                     WHERE id = ?`,
                    [
                        name, relation, phoneTrim || null, gender || null, cleanDob, cleanAge, age_category || null, education || null,
                        cleanAddress, rt_rw || null, kelurahan || null, kecamatan || null, kabupaten || null, provinsi || null,
                        occupation || null, income || null,
                        ktp_path, kk_path,
                        req.user?.id || null, visitorId
                    ]
                );
            } else {
                // Tambah data baru ke tabel Visitors
                const [result] = await connection.query(
                    `INSERT INTO Visitors (
                        patient_id, name, nik, relation, phone, gender, dob, age, age_category, education,
                        address, rt_rw, kelurahan, kecamatan, kabupaten, provinsi, occupation, income,
                        ktp_path, kk_path, is_active, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
                    [
                        patient_id, name, nikTrim, relation, phoneTrim || null, gender || null, cleanDob, cleanAge, age_category || null, education || null,
                        cleanAddress, rt_rw || null, kelurahan || null, kecamatan || null, kabupaten || null, provinsi || null, occupation || null, income || null,
                        ktp_path, kk_path, req.user?.id || null
                    ]
                );
                visitorId = result.insertId;
            }

            await connection.commit();
            res.status(201).json({ message: 'Penunggu berhasil didaftarkan', id: visitorId });
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
    const { 
        name, nik, relation, phone,
        gender, dob, age, age_category, education,
        address, rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
        occupation, income
    } = req.body;

    if (nik && !isValidNIK(nik)) {
        return res.status(400).json({ message: 'NIK harus tepat 16 digit angka sesuai KTP' });
    }

    try {
        const [current] = await db.query('SELECT patient_id, nik FROM Visitors WHERE id = ?', [id]);
        if (current.length === 0) {
            return res.status(404).json({ message: 'Penunggu tidak ditemukan' });
        }

        const patientId = current[0].patient_id;
        const checkNik = nik !== undefined ? String(nik).trim() : current[0].nik;

        // Cek duplikasi NIK pada pasien yang sama
        if (nik !== undefined) {
            const [dupV] = await db.query(
                'SELECT id FROM Visitors WHERE id != ? AND patient_id = ? AND nik = ?',
                [id, patientId, checkNik]
            );
            if (dupV.length > 0) {
                return res.status(400).json({ message: 'No. KTP (NIK) sudah terdaftar untuk penunggu lain pada pasien ini.' });
            }

            // Cek apakah NIK ini adalah pasien yang sedang aktif dirawat di kamar/bed
            const [activePatient] = await db.query(
                `SELECT sl.id, p.name, r.room_number, b.bed_number
                 FROM Patients p
                 JOIN StayLogs sl ON sl.patient_id = p.id AND sl.final_status IS NULL
                 LEFT JOIN Beds b ON sl.bed_id = b.id
                 LEFT JOIN Rooms r ON b.room_id = r.id
                 WHERE p.nik = ?
                 LIMIT 1`,
                [checkNik]
            );
            if (activePatient.length > 0) {
                const stay = activePatient[0];
                const roomInfo = stay.room_number ? ` di Kamar ${stay.room_number} Bed ${stay.bed_number}` : '';
                return res.status(400).json({
                    message: `No. KTP (NIK) terdaftar sebagai pasien (${stay.name}) yang saat ini masih aktif dirawat${roomInfo}. Pasien harus checkout terlebih dahulu sebelum dapat didaftarkan sebagai penunggu.`
                });
            }
        }

        const updates = [];
        const params = [];

        const fields = { 
            name, nik, relation, phone,
            gender, dob, age, age_category, education,
            address, rt_rw, kelurahan, kecamatan, kabupaten, provinsi,
            occupation, income
        };
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
