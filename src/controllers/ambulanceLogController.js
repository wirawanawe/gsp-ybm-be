const db = require('../config/db');

// GET /api/ambulance/logs
// Mengembalikan daftar log dengan kolom extra: patients (array) dan patient_name (gabungan)
exports.getLogs = async (req, res) => {
    try {
        const [rows] = await db.query(
            `
        SELECT 
          al.*,
          a.plate_number AS ambulance_plate
        FROM AmbulanceLogs al
        JOIN Ambulances a ON al.ambulance_id = a.id
        ORDER BY al.departure_time DESC
      `
        );

        for (const row of rows) {
            const [patients] = await db.query(
                `
          SELECT 
            p.id, 
            p.name AS patient_name, 
            p.registration_number,
            alp.destination,
            alp.document_path
          FROM AmbulanceLogPatients alp
          JOIN Patients p ON p.id = alp.patient_id
          WHERE alp.ambulance_log_id = ?
        `,
                [row.id]
            );

            // fallback untuk data lama yang hanya pakai AmbulanceLogs.patient_id
            if (patients.length === 0 && row.patient_id) {
                const [legacy] = await db.query(
                    'SELECT id, name AS patient_name, registration_number FROM Patients WHERE id = ?',
                    [row.patient_id]
                );
                row.patients = legacy;
            } else {
                row.patients = patients;
            }

            row.patient_name = Array.isArray(row.patients) && row.patients.length > 0
                ? row.patients.map((p) => p.patient_name).join(', ')
                : null;
        }

        res.json(rows);
    } catch (error) {
        console.error('getLogs error:', error);
        res
            .status(500)
            .json({ message: 'Terjadi kesalahan server saat mengambil log ambulans' });
    }
};

// POST /api/ambulance/logs
// Mendukung lebih dari satu pasien per booking melalui patient_ids (array)
exports.createLog = async (req, res) => {
    let { ambulance_id, patient_id, patient_ids, destination, patient_destinations, departure_time } = req.body;

    // Parse array/object fields if they are sent as strings via FormData
    try {
        if (typeof patient_ids === 'string') patient_ids = JSON.parse(patient_ids);
        if (typeof patient_destinations === 'string') patient_destinations = JSON.parse(patient_destinations);
    } catch (e) {
        console.error('Error parsing JSON from formData:', e);
    }

    if (!ambulance_id) {
        return res
            .status(400)
            .json({ message: 'Ambulans wajib diisi' });
    }

    // Normalisasi daftar pasien
    const ids = Array.isArray(patient_ids)
        ? patient_ids
        : (patient_id ? [patient_id] : []);

    if (!ids || ids.length === 0) {
        return res
            .status(400)
            .json({ message: 'Minimal satu pasien harus dipilih untuk booking ambulans' });
    }

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const firstPatientId = ids.length > 0 ? ids[0] : null;

            let result;
            if (departure_time) {
                [result] = await connection.query(
                    `
          INSERT INTO AmbulanceLogs (ambulance_id, patient_id, destination, departure_time, status)
          VALUES (?, ?, ?, ?, 'In-Journey')
        `,
                    [ambulance_id, firstPatientId || null, destination, departure_time]
                );
            } else {
                [result] = await connection.query(
                    `
          INSERT INTO AmbulanceLogs (ambulance_id, patient_id, destination, departure_time, status)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'In-Journey')
        `,
                    [ambulance_id, firstPatientId || null, destination]
                );
            }

            const logId = result.insertId;

            // Simpan semua pasien ke tabel relasi jika ada
            if (ids.length > 0) {
                for (const pid of ids) {
                    if (!pid) continue;
                    const destMap = patient_destinations || {};
                    const perPatientDest = destMap[String(pid)] || destMap[pid] || destination;
                    
                    // Check if a file was uploaded for this patient
                    let documentPath = null;
                    if (req.files && Array.isArray(req.files)) {
                        const file = req.files.find(f => f.fieldname === `document_${pid}`);
                        if (file) {
                            documentPath = `ambulance/${file.filename}`;
                        }
                    }

                    await connection.query(
                        'INSERT IGNORE INTO AmbulanceLogPatients (ambulance_log_id, patient_id, destination, document_path) VALUES (?, ?, ?, ?)',
                        [logId, pid, perPatientDest || null, documentPath]
                    );
                }
            }

            await connection.query(
                'UPDATE Ambulances SET status = "In-Journey" WHERE id = ?',
                [ambulance_id]
            );

            await connection.commit();
            res.status(201).json({
                message: 'Booking ambulans berhasil dibuat',
                id: logId
            });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('createLog error:', error);
        res
            .status(500)
            .json({ message: 'Terjadi kesalahan server saat membuat booking ambulans' });
    }
};

// PUT /api/ambulance/logs/:id/complete
exports.completeLog = async (req, res) => {
    const { id } = req.params;
    const { return_time } = req.body;

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Ambil log
            const [logs] = await connection.query(
                'SELECT * FROM AmbulanceLogs WHERE id = ?',
                [id]
            );
            if (logs.length === 0) {
                return res.status(404).json({ message: 'Log ambulans tidak ditemukan' });
            }
            const log = logs[0];

            // Update log
            if (return_time) {
                await connection.query(
                    `
          UPDATE AmbulanceLogs
          SET status = 'Completed', return_time = ?
          WHERE id = ?
        `,
                    [return_time, id]
                );
            } else {
                await connection.query(
                    `
          UPDATE AmbulanceLogs
          SET status = 'Completed', return_time = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
                    [id]
                );
            }

            // Kembalikan status ambulans menjadi Available
            await connection.query(
                'UPDATE Ambulances SET status = "Available" WHERE id = ?',
                [log.ambulance_id]
            );

            await connection.commit();
            res.json({ message: 'Trip ambulans berhasil diselesaikan' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('completeLog error:', error);
        res
            .status(500)
            .json({ message: 'Terjadi kesalahan server saat menyelesaikan trip ambulans' });
    }
};

