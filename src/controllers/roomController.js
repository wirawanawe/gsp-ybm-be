const db = require('../config/db');

// --- ROOMS API ---

// GET /api/rooms
exports.getRooms = async (req, res) => {
    try {
        const [rooms] = await db.query('SELECT * FROM Rooms');
        if (rooms.length === 0) {
            return res.json([]);
        }

        const roomIds = rooms.map((r) => r.id);
        const placeholders = roomIds.map(() => '?').join(',');

        // Ambil semua bed + pasien aktif dalam satu query untuk semua kamar
        const [beds] = await db.query(
            `SELECT 
                b.*,
                p.name AS patient_name,
                p.registration_number AS patient_registration_number,
                s.id AS stay_log_id,
                s.patient_id AS stay_patient_id,
                s.check_in_date,
                s.check_out_date,
                s.final_status
             FROM Beds b
             LEFT JOIN StayLogs s 
                ON s.bed_id = b.id AND s.final_status IS NULL
             LEFT JOIN Patients p 
                ON p.id = s.patient_id
             WHERE b.room_id IN (${placeholders})`,
            roomIds
        );

        for (const room of rooms) {
            room.beds = (beds || []).filter((b) => b.room_id === room.id);
        }

        res.json(rooms);
    } catch (error) {
        console.error('getRooms error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// GET /api/rooms/:id
exports.getRoomById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rooms] = await db.query('SELECT * FROM Rooms WHERE id = ?', [id]);
        if (rooms.length === 0) {
            return res.status(404).json({ message: 'Kamar tidak ditemukan' });
        }
        const room = rooms[0];
        const [beds] = await db.query(
            `SELECT 
                b.*,
                p.name AS patient_name,
                p.registration_number AS patient_registration_number,
                s.check_in_date,
                s.check_out_date,
                s.final_status
             FROM Beds b
             LEFT JOIN StayLogs s 
                ON s.bed_id = b.id AND s.final_status IS NULL
             LEFT JOIN Patients p 
                ON p.id = s.patient_id
             WHERE b.room_id = ?`,
            [room.id]
        );
        room.beds = beds;
        res.json(room);
    } catch (error) {
        console.error('getRoomById error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// POST /api/rooms — buat kamar + bed sesuai capacity agar tombol Check-in muncul di Manajemen Kamar
exports.createRoom = async (req, res) => {
    const { room_number, floor, capacity, description } = req.body;
    const numBeds = Math.max(1, parseInt(capacity, 10) || 1);
    try {
        const [result] = await db.query(
            'INSERT INTO Rooms (room_number, floor, capacity, description) VALUES (?, ?, ?, ?)',
            [room_number, floor, numBeds, description]
        );
        const roomId = result.insertId;
        for (let i = 1; i <= numBeds; i++) {
            await db.query(
                'INSERT INTO Beds (room_id, bed_number, is_available) VALUES (?, ?, TRUE)',
                [roomId, String(i)]
            );
        }
        res.status(201).json({ message: 'Kamar dan bed berhasil ditambahkan', id: roomId, bedsCreated: numBeds });
    } catch (error) {
        console.error('createRoom error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nomor kamar sudah digunakan' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// PUT /api/rooms/:id
exports.updateRoom = async (req, res) => {
    const { id } = req.params;
    const { room_number, floor, capacity, description } = req.body;

    try {
        const [rooms] = await db.query('SELECT * FROM Rooms WHERE id = ?', [id]);
        if (rooms.length === 0) {
            return res.status(404).json({ message: 'Kamar tidak ditemukan' });
        }

        const current = rooms[0];
        const newRoomNumber = room_number || current.room_number;
        const newFloor = typeof floor === 'number' ? floor : current.floor;
        const newCapacity = typeof capacity === 'number' ? capacity : current.capacity;
        const newDescription = description !== undefined ? description : current.description;

        await db.query(
            'UPDATE Rooms SET room_number = ?, floor = ?, capacity = ?, description = ? WHERE id = ?',
            [newRoomNumber, newFloor, newCapacity, newDescription, id]
        );

        res.json({ message: 'Kamar berhasil diupdate' });
    } catch (error) {
        console.error('updateRoom error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nomor kamar sudah digunakan' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// DELETE /api/rooms/:id
exports.deleteRoom = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM Rooms WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Kamar tidak ditemukan' });
        }
        res.json({ message: 'Kamar berhasil dihapus' });
    } catch (error) {
        console.error('deleteRoom error:', error);
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

// PUT /api/rooms/beds/:bedId
exports.updateBed = async (req, res) => {
    const { bedId } = req.params;
    const { bed_number, bed_type, is_available } = req.body;

    try {
        const [beds] = await db.query('SELECT * FROM Beds WHERE id = ?', [bedId]);
        if (beds.length === 0) {
            return res.status(404).json({ message: 'Bed tidak ditemukan' });
        }

        const current = beds[0];
        const newBedNumber = bed_number || current.bed_number;
        const newBedType = bed_type !== undefined ? bed_type : current.bed_type;
        const newIsAvailable =
            typeof is_available === 'boolean' ? is_available : current.is_available;

        await db.query(
            'UPDATE Beds SET bed_number = ?, bed_type = ?, is_available = ? WHERE id = ?',
            [newBedNumber, newBedType, newIsAvailable, bedId]
        );

        res.json({ message: 'Bed berhasil diupdate' });
    } catch (error) {
        console.error('updateBed error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// DELETE /api/rooms/beds/:bedId
exports.deleteBed = async (req, res) => {
    const { bedId } = req.params;

    try {
        const [result] = await db.query('DELETE FROM Beds WHERE id = ?', [bedId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Bed tidak ditemukan' });
        }
        res.json({ message: 'Bed berhasil dihapus' });
    } catch (error) {
        console.error('deleteBed error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
};

// --- CHECK IN (STAY LOGS) ---

// POST /api/rooms/check-in
// Data penunggu sekarang diambil dari tabel Visitors (registrasi penunggu),
// sehingga companion_name / companion_nik yang dikirim dari frontend tidak lagi dipakai di sini.
exports.checkIn = async (req, res) => {
    const { patient_id, bed_id } = req.body;
    try {
        // Check if bed is available
        const [beds] = await db.query('SELECT is_available FROM Beds WHERE id = ?', [bed_id]);
        if (beds.length === 0 || !beds[0].is_available) {
            return res.status(400).json({ message: 'Bed tidak tersedia atau tidak ditemukan' });
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Create StayLog (final_status dibiarkan NULL sebagai tanda masih aktif)
            const [stayResult] = await connection.query(
                'INSERT INTO StayLogs (patient_id, bed_id) VALUES (?, ?)',
                [patient_id, bed_id]
            );
            const stayId = stayResult.insertId;

            // 2. Mark Bed as Unavailable
            await connection.query(
                'UPDATE Beds SET is_available = FALSE WHERE id = ?',
                [bed_id]
            );

            // 3. Tidak mengubah status_verification pasien di sini.
            //    Status verifikasi tetap dikelola di modul Verifikasi Pasien.

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

// POST /api/rooms/transfer
// Pindah kamar: dari bed saat ini ke bed tujuan dengan alasan
exports.transfer = async (req, res) => {
    const { from_bed_id, to_bed_id, reason } = req.body;
    if (!from_bed_id || !to_bed_id) {
        return res.status(400).json({ message: 'from_bed_id dan to_bed_id wajib' });
    }
    if (from_bed_id === to_bed_id) {
        return res.status(400).json({ message: 'Bed tujuan harus berbeda' });
    }
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [fromBeds] = await connection.query('SELECT * FROM Beds WHERE id = ?', [from_bed_id]);
            const [toBeds] = await connection.query('SELECT * FROM Beds WHERE id = ?', [to_bed_id]);
            if (fromBeds.length === 0 || toBeds.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: 'Bed tidak ditemukan' });
            }
            if (fromBeds[0].is_available) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Bed asal kosong, tidak ada pasien untuk dipindah' });
            }
            if (!toBeds[0].is_available) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Bed tujuan sudah terisi' });
            }

            const [activeStays] = await connection.query(
                'SELECT * FROM StayLogs WHERE bed_id = ? AND final_status IS NULL ORDER BY id DESC LIMIT 1',
                [from_bed_id]
            );
            if (activeStays.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Tidak ada stay aktif di bed asal' });
            }
            const stay = activeStays[0];

            await connection.query(
                'UPDATE StayLogs SET check_out_date = CURRENT_TIMESTAMP, final_status = ?, transfer_reason = ? WHERE id = ?',
                ['Transfer', reason || null, stay.id]
            );
            await connection.query('UPDATE Beds SET is_available = TRUE WHERE id = ?', [from_bed_id]);

            await connection.query(
                'INSERT INTO StayLogs (patient_id, bed_id, transfer_reason) VALUES (?, ?, ?)',
                [stay.patient_id, to_bed_id, reason || null]
            );
            await connection.query('UPDATE Beds SET is_available = FALSE WHERE id = ?', [to_bed_id]);

            await connection.commit();
            connection.release();
            res.json({ message: 'Pindah kamar berhasil' });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (error) {
        console.error('transfer error:', error);
        res.status(500).json({ message: 'Gagal memindah kamar' });
    }
};

// PUT /api/rooms/check-out
// Menerima multipart/form-data: bed_id, final_status, departure_photo (opsional)
exports.checkOut = async (req, res) => {
    const bed_id = req.body.bed_id || req.body.bedId;
    const final_status = req.body.final_status || req.body.finalStatus || 'Sembuh';
    if (!bed_id) {
        return res.status(400).json({ message: 'bed_id wajib dikirim untuk checkout' });
    }
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Dapatkan StayLog aktif untuk Bed ini (final_status masih NULL)
            const [activeStays] = await connection.query(
                'SELECT * FROM StayLogs WHERE bed_id = ? AND final_status IS NULL ORDER BY id DESC LIMIT 1',
                [bed_id]
            );

            if (activeStays.length === 0) {
                // Tidak ditemukan riwayat stay aktif, tapi kita tetap boleh mengosongkan bed
                await connection.query(
                    'UPDATE Beds SET is_available = TRUE WHERE id = ?',
                    [bed_id]
                );
                await connection.commit();
                return res.json({ message: 'Bed dikosongkan (tanpa riwayat stay aktif)' });
            }

            const stay = activeStays[0];
            const photoPath = req.file ? `departure/${req.file.filename}` : null;

            // 2. Update StayLog
            await connection.query(
                'UPDATE StayLogs SET check_out_date = CURRENT_TIMESTAMP, final_status = ?, departure_photo_path = ? WHERE id = ?',
                [final_status, photoPath, stay.id]
            );

            // 3. Mark Bed as Available
            await connection.query(
                'UPDATE Beds SET is_available = TRUE WHERE id = ?',
                [bed_id]
            );

            // 4. Deactivate associated Visitors
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE WHERE patient_id = ?',
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
