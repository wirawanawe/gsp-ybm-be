const db = require('../config/db');

// GET /api/ambulance
exports.getAmbulances = async (req, res) => {
    const { status } = req.query; // optional filter by status
    try {
        let query = 'SELECT * FROM Ambulances';
        const params = [];

        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('getAmbulances error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data ambulans' });
    }
};

// GET /api/ambulance/:id
exports.getAmbulanceById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM Ambulances WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ambulans tidak ditemukan' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('getAmbulanceById error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengambil data ambulans' });
    }
};

// POST /api/ambulance
exports.createAmbulance = async (req, res) => {
    const { plate_number, vehicle_model, status } = req.body;

    if (!plate_number || !vehicle_model) {
        return res.status(400).json({ message: 'Nomor polisi dan model kendaraan wajib diisi' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO Ambulances (plate_number, vehicle_model, status) VALUES (?, ?, ?)',
            [plate_number, vehicle_model, status || 'Available']
        );
        res.status(201).json({ message: 'Ambulans berhasil ditambahkan', id: result.insertId });
    } catch (error) {
        console.error('createAmbulance error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nomor polisi sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat menambahkan ambulans' });
    }
};

// PUT /api/ambulance/:id
exports.updateAmbulance = async (req, res) => {
    const { id } = req.params;
    const { plate_number, vehicle_model, status } = req.body;

    try {
        // Ambil data lama
        const [rows] = await db.query('SELECT * FROM Ambulances WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ambulans tidak ditemukan' });
        }

        const current = rows[0];
        const newPlate = plate_number || current.plate_number;
        const newModel = vehicle_model || current.vehicle_model;
        const newStatus = status || current.status;

        const [result] = await db.query(
            'UPDATE Ambulances SET plate_number = ?, vehicle_model = ?, status = ? WHERE id = ?',
            [newPlate, newModel, newStatus, id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ message: 'Tidak ada perubahan yang disimpan' });
        }

        res.json({ message: 'Ambulans berhasil diupdate' });
    } catch (error) {
        console.error('updateAmbulance error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Nomor polisi sudah terdaftar' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat mengupdate ambulans' });
    }
};

// DELETE /api/ambulance/:id
exports.deleteAmbulance = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM Ambulances WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ambulans tidak ditemukan' });
        }
        res.json({ message: 'Ambulans berhasil dihapus' });
    } catch (error) {
        console.error('deleteAmbulance error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghapus ambulans' });
    }
};

