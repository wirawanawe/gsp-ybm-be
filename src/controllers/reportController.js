const db = require('../config/db');

// GET /api/reports/occupancy
// Ringkasan data pasien & okupansi kamar berdasarkan tabel Patients dan StayLogs
exports.getOccupancyStats = async (req, res) => {
    try {
        // Total semua pasien yang pernah terdaftar
        const [[totalRow]] = await db.query(
            'SELECT COUNT(*) AS totalPatients FROM Patients'
        );

        // Pasien yang sedang dirawat (masih punya StayLog aktif: final_status IS NULL)
        const [[activeRow]] = await db.query(
            'SELECT COUNT(DISTINCT patient_id) AS activePatients FROM StayLogs WHERE final_status IS NULL'
        );

        // Pasien dengan status akhir Sembuh / Pulang
        const [[dischargedRow]] = await db.query(
            "SELECT COUNT(DISTINCT patient_id) AS dischargedPatients FROM StayLogs WHERE final_status = 'Sembuh'"
        );

        // Pasien meninggal
        const [[deceasedRow]] = await db.query(
            "SELECT COUNT(DISTINCT patient_id) AS deceasedPatients FROM StayLogs WHERE final_status = 'Meninggal'"
        );

        // Pasien rujukan lanjut / lain
        const [[referredRow]] = await db.query(
            "SELECT COUNT(DISTINCT patient_id) AS referredPatients FROM StayLogs WHERE final_status = 'Rujukan Lanjut'"
        );

        res.json({
            totalPatients: totalRow.totalPatients || 0,
            activePatients: activeRow.activePatients || 0,
            dischargedPatients: dischargedRow.dischargedPatients || 0,
            deceasedPatients: deceasedRow.deceasedPatients || 0,
            referredPatients: referredRow.referredPatients || 0
        });
    } catch (error) {
        console.error('getOccupancyStats error:', error);
        res.status(500).json({ message: 'Gagal mengambil data laporan okupansi' });
    }
};

// GET /api/reports/patient-in-out?date=YYYY-MM-DD
// Laporan pasien masuk dan keluar per tanggal
exports.getPatientInOut = async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    try {
        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                p.name AS patient_name, p.registration_number, p.nik,
                b.bed_number, r.room_number
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             LEFT JOIN Beds b ON b.id = s.bed_id
             LEFT JOIN Rooms r ON r.id = b.room_id
             WHERE DATE(s.check_in_date) = ? OR DATE(s.check_out_date) = ?
             ORDER BY s.check_in_date DESC`,
            [targetDate, targetDate]
        );
        res.json(rows);
    } catch (error) {
        console.error('getPatientInOut error:', error);
        res.status(500).json({ message: 'Gagal mengambil laporan pasien masuk/keluar' });
    }
};

// GET /api/reports/ambulance-usage?date=YYYY-MM-DD
// Laporan penggunaan ambulans per tanggal
exports.getAmbulanceUsage = async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    try {
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             WHERE DATE(al.departure_time) = ?
             ORDER BY al.departure_time DESC`,
            [targetDate]
        );
        res.json(rows);
    } catch (error) {
        console.error('getAmbulanceUsage error:', error);
        res.status(500).json({ message: 'Gagal mengambil laporan penggunaan ambulans' });
    }
};

