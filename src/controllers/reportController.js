const db = require('../config/db');
const ExcelJS = require('exceljs');
const { getCache, setCache } = require('../config/cache');

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

// GET /api/reports/patient-in-out?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// Jika tanggal tidak diisi, tampilkan semua data (tanpa filter tanggal).
// Masih mendukung ?date=YYYY-MM-DD untuk kompatibilitas lama.
// Laporan pasien masuk dan keluar per rentang tanggal (berdasarkan tanggal masuk/keluar).
exports.getPatientInOut = async (req, res) => {
    const { date, start_date, end_date } = req.query;
    // Backward compatibility: jika hanya ada ?date lama, pakai sebagai from/to
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const cacheKey = `report:patient-in-out:${JSON.stringify({ from, to })}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        let whereClause = '1=1';
        const params = [];

        if (from && to) {
            whereClause += ' AND ((DATE(s.check_in_date) BETWEEN ? AND ?) OR (DATE(s.check_out_date) BETWEEN ? AND ?))';
            params.push(from, to, from, to);
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path,
                p.name AS patient_name, p.registration_number, p.nik,
                b.bed_number, r.room_number
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             LEFT JOIN Beds b ON b.id = s.bed_id
             LEFT JOIN Rooms r ON r.id = b.room_id
             WHERE ${whereClause}
             ORDER BY s.check_in_date DESC`,
            params
        );
        setCache(cacheKey, rows, 60);
        res.json(rows);
    } catch (error) {
        console.error('getPatientInOut error:', error);
        res.status(500).json({ message: 'Gagal mengambil laporan pasien masuk/keluar' });
    }
};

// GET /api/reports/ambulance-usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// Jika tanggal tidak diisi, tampilkan semua data (tanpa filter tanggal).
// Masih mendukung ?date=YYYY-MM-DD untuk kompatibilitas lama.
// Laporan penggunaan ambulans per rentang tanggal (berdasarkan tanggal berangkat).
exports.getAmbulanceUsage = async (req, res) => {
    const { date, start_date, end_date } = req.query;
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const cacheKey = `report:ambulance-usage:${JSON.stringify({ from, to })}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const hasDate = from && to;
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             ${hasDate ? 'WHERE DATE(al.departure_time) BETWEEN ? AND ?' : ''}
             ORDER BY al.departure_time DESC`,
            hasDate ? [from, to] : []
        );
        setCache(cacheKey, rows, 60);
        res.json(rows);
    } catch (error) {
        console.error('getAmbulanceUsage error:', error);
        res.status(500).json({ message: 'Gagal mengambil laporan penggunaan ambulans' });
    }
};

// GET /api/reports/patient-in-out/export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// Jika tanggal tidak diisi, export semua data.
exports.exportPatientInOut = async (req, res) => {
    const { date, start_date, end_date } = req.query;
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        let whereClause = '1=1';
        const params = [];

        if (from && to) {
            whereClause += ' AND ((DATE(s.check_in_date) BETWEEN ? AND ?) OR (DATE(s.check_out_date) BETWEEN ? AND ?))';
            params.push(from, to, from, to);
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path,
                p.name AS patient_name, p.registration_number, p.nik,
                b.bed_number, r.room_number
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             LEFT JOIN Beds b ON b.id = s.bed_id
             LEFT JOIN Rooms r ON r.id = b.room_id
             WHERE ${whereClause}
             ORDER BY s.check_in_date DESC`,
            params
        );

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Pasien');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'Nama Pasien', key: 'patient_name', width: 28 },
            { header: 'No Registrasi', key: 'registration_number', width: 22 },
            { header: 'NIK', key: 'nik', width: 20 },
            { header: 'Kamar', key: 'room_number', width: 10 },
            { header: 'Bed', key: 'bed_number', width: 8 },
            { header: 'Waktu Masuk', key: 'check_in_date', width: 22 },
            { header: 'Waktu Keluar', key: 'check_out_date', width: 22 },
            { header: 'Status Akhir', key: 'final_status', width: 18 },
            { header: 'Dokumen Kepulangan', key: 'departure_photo_path', width: 30 }
        ];

        rows.forEach((row, index) => {
            sheet.addRow({
                no: index + 1,
                patient_name: row.patient_name,
                registration_number: row.registration_number,
                nik: row.nik,
                room_number: row.room_number || '',
                bed_number: row.bed_number || '',
                // gunakan objek Date agar format jam muncul di Excel
                check_in_date: row.check_in_date ? new Date(row.check_in_date) : null,
                check_out_date: row.check_out_date ? new Date(row.check_out_date) : null,
                final_status: row.final_status || 'Masih dirawat',
                departure_photo_path: row.departure_photo_path || ''
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getColumn('check_in_date').numFmt = 'dd-mmm-yyyy hh:mm';
        sheet.getColumn('check_out_date').numFmt = 'dd-mmm-yyyy hh:mm';

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        const fileLabel = from && to ? `${from}_sampai_${to}` : 'semua-data';
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="laporan-pasien-${fileLabel}.xlsx"`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('exportPatientInOut error:', error);
        res.status(500).json({ message: 'Gagal mengekspor laporan pasien' });
    }
};

// GET /api/reports/ambulance-usage/export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
exports.exportAmbulanceUsage = async (req, res) => {
    const { date, start_date, end_date } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    let from = start_date || date || today;
    let to = end_date || date || today;
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             WHERE DATE(al.departure_time) BETWEEN ? AND ?
             ORDER BY al.departure_time DESC`,
            [from, to]
        );

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Ambulans');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'No Polisi', key: 'plate_number', width: 16 },
            { header: 'Kendaraan', key: 'vehicle_model', width: 22 },
            { header: 'Tujuan', key: 'destination', width: 30 },
            { header: 'Nama Pasien', key: 'patient_name', width: 26 },
            { header: 'No Registrasi', key: 'registration_number', width: 20 },
            { header: 'Berangkat', key: 'departure_time', width: 22 },
            { header: 'Kembali', key: 'return_time', width: 22 },
            { header: 'Status', key: 'status', width: 14 }
        ];

        rows.forEach((row, index) => {
            sheet.addRow({
                no: index + 1,
                plate_number: row.plate_number,
                vehicle_model: row.vehicle_model,
                destination: row.destination,
                patient_name: row.patient_name || '',
                registration_number: row.registration_number || '',
                // objek Date supaya jam ditampilkan
                departure_time: row.departure_time ? new Date(row.departure_time) : null,
                return_time: row.return_time ? new Date(row.return_time) : null,
                status: row.status === 'In-Journey' ? 'Dalam Perjalanan' : row.status
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getColumn('departure_time').numFmt = 'dd-mmm-yyyy hh:mm';
        sheet.getColumn('return_time').numFmt = 'dd-mmm-yyyy hh:mm';

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="laporan-ambulans-${from}_sampai_${to}.xlsx"`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('exportAmbulanceUsage error:', error);
        res.status(500).json({ message: 'Gagal mengekspor laporan ambulans' });
    }
};

