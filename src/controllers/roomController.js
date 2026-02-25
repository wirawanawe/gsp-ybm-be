const db = require('../config/db');

// --- ROOMS API ---

// GET /api/rooms
exports.getRooms = async (req, res) => {
    try {
        const [rooms] = await db.query('SELECT * FROM Rooms');
        // Fetch beds for each room
        for (let room of rooms) {
            const [beds] = await db.query('SELECT * FROM Beds WHERE room_id = ?', [room.id]);
            room.beds = beds;
        }
        res.json(rooms);
    } catch (error) {
        console.error('getRooms error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// POST /api/rooms
exports.createRoom = async (req, res) => {
    const { room_number, floor, capacity, description } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO Rooms (room_number, floor, capacity, description) VALUES (?, ?, ?, ?)',
            [room_number, floor, capacity, description]
        );
        res.status(201).json({ message: 'Kamar berhasil ditambahkan', id: result.insertId });
    } catch (error) {
        console.error('createRoom error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// --- BEDS API ---

// POST /api/rooms/:roomId/beds
exports.createBed = async (req, res) => {
    const { roomId } = req.params;
    const { bed_number, bed_type } = req.body;

    try {
        const [result] = await db.query(
            'INSERT INTO Beds (room_id, bed_number, bed_type) VALUES (?, ?, ?)',
            [roomId, bed_number, bed_type]
        );
        res.status(201).json({ message: 'Bed berhasil ditambahkan', id: result.insertId });
    } catch (error) {
        console.error('createBed error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// --- CHECK IN (STAY LOGS) ---

// POST /api/rooms/check-in
exports.checkIn = async (req, res) => {
    const { patient_id, bed_id, companion_name, companion_nik } = req.body;
    try {
        // Check if bed is available
        const [beds] = await db.query('SELECT is_available FROM Beds WHERE id = ?', [bed_id]);
        if (beds.length === 0 || !beds[0].is_available) {
            return res.status(400).json({ message: 'Bed tidak tersedia atau tidak ditemukan' });
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Create StayLog
            const [stayResult] = await connection.query(
                'INSERT INTO StayLogs (patient_id, bed_id, check_in_date, final_status) VALUES (?, ?, CURRENT_TIMESTAMP, "Active")',
                [patient_id, bed_id]
            );
            const stayId = stayResult.insertId;

            // 2. Mark Bed as Unavailable
            await connection.query(
                'UPDATE Beds SET is_available = FALSE WHERE id = ?',
                [bed_id]
            );

            // 3. Update Patient Status
            await connection.query(
                'UPDATE Patients SET status_verification = "Active" WHERE id = ?',
                [patient_id]
            );

            // 4. Create Visitor if provided
            if (companion_name && companion_nik) {
                await connection.query(
                    'INSERT INTO Visitors (patient_id, name, nik) VALUES (?, ?, ?)',
                    [patient_id, companion_name, companion_nik]
                );
            }

            await connection.commit();
            res.json({ message: 'Check-in berhasil disimpan', stay_id: stayId });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('checkIn error:', error);
        res.status(500).json({ message: 'Gagal melakukan check-in' });
    }
};

// PUT /api/rooms/check-out
exports.checkOut = async (req, res) => {
    const { bed_id, final_status } = req.body; // e.g., 'Sembuh', 'Rujukan Lanjut', 'Meninggal'
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Dapatkan StayLog Active untuk Bed ini
            const [activeStays] = await connection.query(
                'SELECT * FROM StayLogs WHERE bed_id = ? AND final_status = "Active" ORDER BY id DESC LIMIT 1',
                [bed_id]
            );

            if (activeStays.length === 0) {
                return res.status(404).json({ message: 'Tidak ada pasien aktif di bed ini' });
            }

            const stay = activeStays[0];

            // 2. Update StayLog
            await connection.query(
                'UPDATE StayLogs SET check_out_date = CURRENT_TIMESTAMP, final_status = ? WHERE id = ?',
                [final_status, stay.id]
            );

            // 3. Mark Bed as Available
            await connection.query(
                'UPDATE Beds SET is_available = TRUE WHERE id = ?',
                [bed_id]
            );

            // 4. Update Patient Verification Status to match checkout status
            await connection.query(
                'UPDATE Patients SET status_verification = ? WHERE id = ?',
                [final_status, stay.patient_id]
            );

            // 5. Deactivate associated Visitors
            await connection.query(
                'UPDATE Visitors SET status = "Inactive" WHERE patient_id = ?',
                [stay.patient_id]
            );

            await connection.commit();
            res.json({ message: 'Check-out berhasil disimpan' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('checkOut error:', error);
        res.status(500).json({ message: 'Gagal melakukan check-out' });
    }
};
