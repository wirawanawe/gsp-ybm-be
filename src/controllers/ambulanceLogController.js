const db = require('../config/db');

// GET /api/ambulance/logs
exports.getLogs = async (req, res) => {
    try {
        const [rows] = await db.query(
            `
        SELECT 
          al.*,
          a.plate_number AS ambulance_plate,
          p.name AS patient_name,
          p.registration_number
        FROM AmbulanceLogs al
        JOIN Ambulances a ON al.ambulance_id = a.id
        LEFT JOIN Patients p ON al.patient_id = p.id
        ORDER BY al.departure_time DESC
      `
        );
        res.json(rows);
    } catch (error) {
        console.error('getLogs error:', error);
        res
            .status(500)
            .json({ message: 'Terjadi kesalahan server saat mengambil log ambulans' });
    }
};

// POST /api/ambulance/logs
exports.createLog = async (req, res) => {
    const { ambulance_id, patient_id, destination } = req.body;

    if (!ambulance_id || !destination) {
        return res
            .status(400)
            .json({ message: 'Ambulans dan tujuan perjalanan wajib diisi' });
    }

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [result] = await connection.query(
                `
          INSERT INTO AmbulanceLogs (ambulance_id, patient_id, destination, departure_time, status)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'In-Journey')
        `,
                [ambulance_id, patient_id || null, destination]
            );

            await connection.query(
                'UPDATE Ambulances SET status = "In-Journey" WHERE id = ?',
                [ambulance_id]
            );

            await connection.commit();
            res.status(201).json({
                message: 'Booking ambulans berhasil dibuat',
                id: result.insertId
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
            await connection.query(
                `
          UPDATE AmbulanceLogs
          SET status = 'Completed', return_time = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
                [id]
            );

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

