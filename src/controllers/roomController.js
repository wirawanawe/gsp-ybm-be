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

        // Isi stay_visitors per bed (untuk fitur Tambah Penunggu)
        const stayLogIds = [...new Set((beds || []).map((b) => b.stay_log_id).filter(Boolean))];
        if (stayLogIds.length > 0) {
            const placeholdersStay = stayLogIds.map(() => '?').join(',');
            const [svRows] = await db.query(
                `SELECT slv.stay_log_id, v.id AS visitor_id, v.name, v.nik, v.relation, v.phone
                 FROM StayLogVisitors slv
                 INNER JOIN Visitors v ON v.id = slv.visitor_id
                 WHERE slv.stay_log_id IN (${placeholdersStay})`,
                stayLogIds
            );
            const byStay = {};
            for (const row of svRows || []) {
                if (!byStay[row.stay_log_id]) byStay[row.stay_log_id] = [];
                byStay[row.stay_log_id].push({
                    id: row.visitor_id,
                    name: row.name,
                    nik: row.nik,
                    relation: row.relation,
                    phone: row.phone
                });
            }
            for (const room of rooms) {
                for (const bed of room.beds || []) {
                    bed.stay_visitors = byStay[bed.stay_log_id] || [];
                }
            }
        } else {
            for (const room of rooms) {
                for (const bed of room.beds || []) {
                    bed.stay_visitors = [];
                }
            }
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
        const userId = req.user?.id || null;
        const [result] = await db.query(
            'INSERT INTO Rooms (room_number, floor, capacity, description, created_by) VALUES (?, ?, ?, ?, ?)',
            [room_number, floor, numBeds, description, userId]
        );
        const roomId = result.insertId;
        for (let i = 1; i <= numBeds; i++) {
            await db.query(
                'INSERT INTO Beds (room_id, bed_number, is_available, created_by) VALUES (?, ?, TRUE, ?)',
                [roomId, String(i), userId]
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

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Ambil data bed yang ada sekarang
            const [existingBeds] = await connection.query('SELECT id, is_available FROM Beds WHERE room_id = ? ORDER BY id ASC', [id]);
            const currentBedsCount = existingBeds.length;

            // Jika kapasitas dikurangi, pastikan ada bed kosong yang bisa dihapus
            if (newCapacity < currentBedsCount) {
                const bedsToRemoveCount = currentBedsCount - newCapacity;
                const emptyBeds = existingBeds.filter(b => b.is_available).reverse(); // Ambil dari belakang/ID terbesar

                if (emptyBeds.length < bedsToRemoveCount) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({
                        message: `Kapasitas tidak bisa dikurangi menjadi ${newCapacity}. Hanya ada ${emptyBeds.length} bed kosong, tapi butuh menghapus ${bedsToRemoveCount} bed. Kosongkan bed terisi terlebih dahulu.`
                    });
                }

                // Hapus bed kosong
                const bedsToDelete = emptyBeds.slice(0, bedsToRemoveCount).map(b => b.id);
                if (bedsToDelete.length > 0) {
                    const placeholders = bedsToDelete.map(() => '?').join(',');
                    await connection.query(
                        `DELETE FROM Beds WHERE id IN (${placeholders})`,
                        bedsToDelete
                    );
                }
            }

            // Update data kamar
            await connection.query(
                'UPDATE Rooms SET room_number = ?, floor = ?, capacity = ?, description = ?, updated_by = ? WHERE id = ?',
                [newRoomNumber, newFloor, newCapacity, newDescription, req.user?.id || null, id]
            );

            // Jika kapasitas ditambah, buat bed baru
            if (newCapacity > currentBedsCount) {
                const bedsToAdd = newCapacity - currentBedsCount;
                let nextNum = currentBedsCount + 1;
                for (let i = 0; i < bedsToAdd; i++) {
                    await connection.query(
                        'INSERT INTO Beds (room_id, bed_number, is_available, created_by) VALUES (?, ?, TRUE, ?)',
                        [id, String(nextNum + i), req.user?.id || null]
                    );
                }
            }

            await connection.commit();
            connection.release();
            res.json({ message: 'Kamar berhasil diupdate dan kapasitas bed telah disinkronisasi' });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
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
            'INSERT INTO Beds (room_id, bed_number, bed_type, created_by) VALUES (?, ?, ?, ?)',
            [roomId, bed_number, bed_type, req.user?.id || null]
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
            'UPDATE Beds SET bed_number = ?, bed_type = ?, is_available = ?, updated_by = ? WHERE id = ?',
            [newBedNumber, newBedType, newIsAvailable, req.user?.id || null, bedId]
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
// Menerima patient_id, bed_id, dan opsional visitor_id (atau visitor_ids array) untuk penunggu.
exports.checkIn = async (req, res) => {
    const { patient_id, bed_id, visitor_id, visitor_ids, check_in_date } = req.body;
    try {
        // Check if bed is available
        const [beds] = await db.query('SELECT is_available FROM Beds WHERE id = ?', [bed_id]);
        if (beds.length === 0 || !beds[0].is_available) {
            return res.status(400).json({ message: 'Bed tidak tersedia atau tidak ditemukan' });
        }

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const userId = req.user?.id || null;
            // 1. Create StayLog (final_status dibiarkan NULL sebagai tanda masih aktif)
            let stayResult;
            if (check_in_date) {
                [stayResult] = await connection.query(
                    'INSERT INTO StayLogs (patient_id, bed_id, check_in_date, created_by) VALUES (?, ?, ?, ?)',
                    [patient_id, bed_id, check_in_date, userId]
                );
            } else {
                [stayResult] = await connection.query(
                    'INSERT INTO StayLogs (patient_id, bed_id, created_by) VALUES (?, ?, ?)',
                    [patient_id, bed_id, userId]
                );
            }
            const stayId = stayResult.insertId;

            // 2. Mark Bed as Unavailable
            await connection.query(
                'UPDATE Beds SET is_available = FALSE, updated_by = ? WHERE id = ?',
                [userId, bed_id]
            );

            // 2b. Update status_rumah_singgah di PatientRegistrations jadi Dirawat
            await connection.query(
                "UPDATE PatientRegistrations SET status_rumah_singgah = 'Dirawat', updated_by = ? WHERE patient_id = ?",
                [userId, patient_id]
            );

            // 3. Simpan penunggu ke StayLogVisitors (visitor_id atau visitor_ids)
            const vIds = [];
            if (visitor_id) vIds.push(Number(visitor_id));
            if (Array.isArray(visitor_ids)) visitor_ids.forEach((v) => vIds.push(Number(v)));
            const uniqueIds = [...new Set(vIds)].filter(Boolean);
            for (const vid of uniqueIds) {
                await connection.query(
                    'INSERT IGNORE INTO StayLogVisitors (stay_log_id, visitor_id, created_by) VALUES (?, ?, ?)',
                    [stayId, vid, userId]
                );
                await connection.query(
                    'UPDATE Visitors SET is_active = TRUE WHERE id = ?',
                    [vid]
                );
            }

            // 4. Tidak mengubah status_verification pasien di sini.
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

            const userId = req.user?.id || null;
            await connection.query(
                'UPDATE StayLogs SET check_out_date = CURRENT_TIMESTAMP, final_status = ?, transfer_reason = ?, updated_by = ? WHERE id = ?',
                ['Transfer', reason || null, userId, stay.id]
            );
            await connection.query('UPDATE Beds SET is_available = TRUE, updated_by = ? WHERE id = ?', [userId, from_bed_id]);

            await connection.query(
                'INSERT INTO StayLogs (patient_id, bed_id, transfer_reason, created_by) VALUES (?, ?, ?, ?)',
                [stay.patient_id, to_bed_id, reason || null, userId]
            );
            await connection.query('UPDATE Beds SET is_available = FALSE, updated_by = ? WHERE id = ?', [userId, to_bed_id]);

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

            const userId = req.user?.id || null;
            const stay = activeStays[0];
            const photoPath = req.file ? `departure/${req.file.filename}` : null;
            const checkOutTimestamp = req.body.check_out_date || null;

            // 2. Update StayLog
            if (checkOutTimestamp) {
                await connection.query(
                    'UPDATE StayLogs SET check_out_date = ?, final_status = ?, departure_photo_path = ?, updated_by = ? WHERE id = ?',
                    [checkOutTimestamp, final_status, photoPath, userId, stay.id]
                );
            } else {
                await connection.query(
                    'UPDATE StayLogs SET check_out_date = CURRENT_TIMESTAMP, final_status = ?, departure_photo_path = ?, updated_by = ? WHERE id = ?',
                    [final_status, photoPath, userId, stay.id]
                );
            }

            // 3. Mark Bed as Available
            await connection.query(
                'UPDATE Beds SET is_available = TRUE, updated_by = ? WHERE id = ?',
                [userId, bed_id]
            );

            // 4. Deactivate associated Visitors
            await connection.query(
                'UPDATE Visitors SET is_active = FALSE, updated_by = ? WHERE patient_id = ?',
                [userId, stay.patient_id]
            );

            // 5. Update status_rumah_singgah di PatientRegistrations jadi Sudah Pulang
            await connection.query(
                "UPDATE PatientRegistrations SET status_rumah_singgah = 'Sudah Pulang', updated_by = ? WHERE patient_id = ?",
                [userId, stay.patient_id]
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

// POST /api/rooms/stay/:stayId/visitors — Tambah penunggu ke stay aktif
exports.addStayVisitor = async (req, res) => {
    const stayId = req.params.stayId;
    const { visitor_id } = req.body;
    if (!visitor_id) {
        return res.status(400).json({ message: 'visitor_id wajib' });
    }
    try {
        const [stays] = await db.query(
            'SELECT id, patient_id FROM StayLogs WHERE id = ? AND final_status IS NULL',
            [stayId]
        );
        if (stays.length === 0) {
            return res.status(404).json({ message: 'Stay tidak ditemukan atau sudah checkout' });
        }
        const patientId = stays[0].patient_id;
        const [visitors] = await db.query(
            'SELECT id FROM Visitors WHERE id = ? AND patient_id = ?',
            [visitor_id, patientId]
        );
        if (visitors.length === 0) {
            return res.status(400).json({ message: 'Penunggu tidak ditemukan atau bukan milik pasien ini' });
        }
        await db.query(
            'INSERT IGNORE INTO StayLogVisitors (stay_log_id, visitor_id, created_by) VALUES (?, ?, ?)',
            [stayId, visitor_id, req.user?.id || null]
        );
        res.json({ message: 'Penunggu berhasil ditambahkan' });
    } catch (error) {
        console.error('addStayVisitor error:', error);
        res.status(500).json({ message: 'Gagal menambah penunggu' });
    }
};
