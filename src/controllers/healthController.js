const db = require('../config/db');

// ─── PATIENT VITALS (Tensi) ───────────────────────────────────────────────────

/** GET /api/health/vitals — list semua tensi, optional ?patient_id=&date_from=&date_to= */
exports.getVitals = async (req, res) => {
    try {
        const { patient_id, date_from, date_to, limit = 50 } = req.query;
        let sql = `
            SELECT v.*, p.name AS patient_name, p.registration_number
            FROM PatientVitals v
            JOIN Patients p ON v.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (patient_id) { sql += ' AND v.patient_id = ?'; params.push(patient_id); }
        if (date_from)  { sql += ' AND v.recorded_date >= ?'; params.push(date_from); }
        if (date_to)    { sql += ' AND v.recorded_date <= ?'; params.push(date_to); }
        sql += ' ORDER BY v.recorded_date DESC, v.recorded_time DESC LIMIT ?';
        params.push(Number(limit));
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getVitals error:', err);
        res.status(500).json({ message: 'Gagal mengambil data tensi' });
    }
};

/** POST /api/health/vitals */
exports.createVital = async (req, res) => {
    try {
        const {
            patient_id, recorded_date, recorded_time,
            systolic, diastolic, pulse, spo2, temperature, weight,
            notes, recorded_by_name
        } = req.body;

        if (!patient_id || !recorded_date) {
            return res.status(400).json({ message: 'patient_id dan recorded_date wajib diisi' });
        }

        const [result] = await db.query(
            `INSERT INTO PatientVitals
             (patient_id, recorded_date, recorded_time, systolic, diastolic,
              pulse, spo2, temperature, weight, notes, recorded_by_name, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [patient_id, recorded_date, recorded_time || null,
             systolic || null, diastolic || null, pulse || null,
             spo2 || null, temperature || null, weight || null,
             notes || null, recorded_by_name || null, req.user?.id || null]
        );

        const [rows] = await db.query(
            `SELECT v.*, p.name AS patient_name FROM PatientVitals v
             JOIN Patients p ON v.patient_id = p.id WHERE v.id = ?`,
            [result.insertId]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createVital error:', err);
        res.status(500).json({ message: 'Gagal menyimpan data tensi' });
    }
};

/** PUT /api/health/vitals/:id */
exports.updateVital = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            recorded_date, recorded_time, systolic, diastolic,
            pulse, spo2, temperature, weight, notes, recorded_by_name
        } = req.body;

        const [check] = await db.query('SELECT id FROM PatientVitals WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });

        await db.query(
            `UPDATE PatientVitals SET
             recorded_date=?, recorded_time=?, systolic=?, diastolic=?,
             pulse=?, spo2=?, temperature=?, weight=?, notes=?,
             recorded_by_name=?, updated_by=?
             WHERE id=?`,
            [recorded_date, recorded_time || null,
             systolic || null, diastolic || null, pulse || null,
             spo2 || null, temperature || null, weight || null,
             notes || null, recorded_by_name || null, req.user?.id || null, id]
        );
        res.json({ message: 'Data tensi diupdate' });
    } catch (err) {
        console.error('updateVital error:', err);
        res.status(500).json({ message: 'Gagal update data tensi' });
    }
};

/** DELETE /api/health/vitals/:id */
exports.deleteVital = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM PatientVitals WHERE id = ?', [id]);
        res.json({ message: 'Data tensi dihapus' });
    } catch (err) {
        console.error('deleteVital error:', err);
        res.status(500).json({ message: 'Gagal menghapus data tensi' });
    }
};

// ─── PATIENT CONDITIONS ───────────────────────────────────────────────────────

/** GET /api/health/conditions */
exports.getConditions = async (req, res) => {
    try {
        const { patient_id, date_from, date_to, severity, limit = 50 } = req.query;
        let sql = `
            SELECT c.*, p.name AS patient_name, p.registration_number
            FROM PatientConditions c
            JOIN Patients p ON c.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (patient_id) { sql += ' AND c.patient_id = ?'; params.push(patient_id); }
        if (date_from)  { sql += ' AND c.condition_date >= ?'; params.push(date_from); }
        if (date_to)    { sql += ' AND c.condition_date <= ?'; params.push(date_to); }
        if (severity)   { sql += ' AND c.severity = ?'; params.push(severity); }
        sql += ' ORDER BY c.condition_date DESC LIMIT ?';
        params.push(Number(limit));
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getConditions error:', err);
        res.status(500).json({ message: 'Gagal mengambil catatan kondisi' });
    }
};

/** POST /api/health/conditions */
exports.createCondition = async (req, res) => {
    try {
        const {
            patient_id, condition_date, severity, description,
            actions_taken, follow_up, recorded_by_name
        } = req.body;

        if (!patient_id || !condition_date || !description) {
            return res.status(400).json({ message: 'patient_id, condition_date, description wajib diisi' });
        }

        const [result] = await db.query(
            `INSERT INTO PatientConditions
             (patient_id, condition_date, severity, description,
              actions_taken, follow_up, recorded_by_name, created_by)
             VALUES (?,?,?,?,?,?,?,?)`,
            [patient_id, condition_date, severity || 'Sedang', description,
             actions_taken || null, follow_up || null,
             recorded_by_name || null, req.user?.id || null]
        );

        const [rows] = await db.query(
            `SELECT c.*, p.name AS patient_name FROM PatientConditions c
             JOIN Patients p ON c.patient_id = p.id WHERE c.id = ?`,
            [result.insertId]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createCondition error:', err);
        res.status(500).json({ message: 'Gagal menyimpan catatan kondisi' });
    }
};

/** PUT /api/health/conditions/:id */
exports.updateCondition = async (req, res) => {
    try {
        const { id } = req.params;
        const { condition_date, severity, description, actions_taken, follow_up, recorded_by_name } = req.body;

        const [check] = await db.query('SELECT id FROM PatientConditions WHERE id = ?', [id]);
        if (!check.length) return res.status(404).json({ message: 'Data tidak ditemukan' });

        await db.query(
            `UPDATE PatientConditions SET
             condition_date=?, severity=?, description=?,
             actions_taken=?, follow_up=?, recorded_by_name=?, updated_by=?
             WHERE id=?`,
            [condition_date, severity, description,
             actions_taken || null, follow_up || null,
             recorded_by_name || null, req.user?.id || null, id]
        );
        res.json({ message: 'Catatan kondisi diupdate' });
    } catch (err) {
        console.error('updateCondition error:', err);
        res.status(500).json({ message: 'Gagal update catatan kondisi' });
    }
};

/** DELETE /api/health/conditions/:id */
exports.deleteCondition = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM PatientConditions WHERE id = ?', [id]);
        res.json({ message: 'Catatan kondisi dihapus' });
    } catch (err) {
        console.error('deleteCondition error:', err);
        res.status(500).json({ message: 'Gagal menghapus catatan kondisi' });
    }
};

/** GET /api/health/patients-search — cari pasien by nama atau NIK */
exports.searchPatients = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json([]);
        const [rows] = await db.query(
            `SELECT id, name, registration_number, nik, gender, dob
             FROM Patients WHERE name LIKE ? OR nik LIKE ?
             ORDER BY name LIMIT 20`,
            [`%${q}%`, `%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error('searchPatients error:', err);
        res.status(500).json({ message: 'Gagal mencari pasien' });
    }
};
