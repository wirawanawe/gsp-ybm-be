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
    const { date, start_date, end_date, final_status } = req.query;
    // Backward compatibility: jika hanya ada ?date lama, pakai sebagai from/to
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const cacheKey = `report:patient-in-out:${JSON.stringify({ from, to, final_status })}`;
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
        if (final_status) {
            if (final_status === 'Masih dirawat' || final_status === 'null') {
                whereClause += ' AND s.final_status IS NULL';
            } else {
                whereClause += ' AND s.final_status = ?';
                params.push(final_status);
            }
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path, s.transfer_reason,
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
    const { date, start_date, end_date, final_status } = req.query;
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
        if (final_status) {
            if (final_status === 'Masih dirawat' || final_status === 'null') {
                whereClause += ' AND s.final_status IS NULL';
            } else {
                whereClause += ' AND s.final_status = ?';
                params.push(final_status);
            }
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path, s.transfer_reason,
                p.name AS patient_name, p.registration_number, p.nik, p.dob, p.gender, p.phone, p.address,
                p.rt_rw, p.kelurahan, p.kecamatan, p.kabupaten, p.provinsi, p.diagnosis, p.occupation, p.income,
                b.bed_number, r.room_number
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             LEFT JOIN Beds b ON b.id = s.bed_id
             LEFT JOIN Rooms r ON r.id = b.room_id
             WHERE ${whereClause}
             ORDER BY s.check_in_date DESC`,
            params
        );

        // Fetch visitors for these stay logs
        const stayIds = rows.map(r => r.id);
        let visitorsMap = {};
        if (stayIds.length > 0) {
            const [vRows] = await db.query(
                `SELECT slv.stay_log_id, v.name, v.nik, v.relation, v.phone
                 FROM StayLogVisitors slv
                 JOIN Visitors v ON v.id = slv.visitor_id
                 WHERE slv.stay_log_id IN (?)`,
                [stayIds]
            );
            vRows.forEach(v => {
                if (!visitorsMap[v.stay_log_id]) visitorsMap[v.stay_log_id] = [];
                visitorsMap[v.stay_log_id].push(v);
            });
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Pasien');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'NIK', key: 'nik', width: 22 },
            { header: 'Nama Penerima Manfaat', key: 'name', width: 28 },
            { header: 'Nomor Handphone', key: 'phone', width: 18 },
            { header: 'Alamat', key: 'address', width: 35 },
            { header: 'Kelurahan', key: 'kelurahan', width: 18 },
            { header: 'Kecamatan', key: 'kecamatan', width: 18 },
            { header: 'Kota/Kabupaten', key: 'kabupaten', width: 18 },
            { header: 'Provinsi', key: 'provinsi', width: 18 },
            { header: 'Penghuni', key: 'penghuni', width: 12 },
            { header: 'Jenis Kelamin', key: 'gender', width: 12 },
            { header: 'Tanggal Lahir', key: 'dob', width: 15 },
            { header: 'Umur', key: 'age_cat', width: 12 },
            { header: 'Pendidikan', key: 'education', width: 15 },
            { header: 'Pekerjaan', key: 'occupation', width: 20 },
            { header: 'Jenis Penyakit', key: 'diagnosis', width: 30 },
            { header: 'Kategori Penyakit', key: 'diag_cat', width: 18 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Tanggal Check In', key: 'check_in', width: 20 },
            { header: 'Tanggal Check Out', key: 'check_out', width: 20 }
        ];

        const getAgeCategory = (dob) => {
            if (!dob) return '-';
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            if (age < 18) return 'Anak Anak';
            if (age >= 60) return 'Lansia';
            return 'Dewasa';
        };

        const getDiseaseCategory = (diagnosis) => {
            if (!diagnosis) return 'Non Kanker';
            const d = diagnosis.toLowerCase();
            const keywords = ['kanker', 'cancer', 'tumor', 'ca ', 'carcinoma', 'melanoma', 'sarcoma', 'limfoma', 'leukemia'];
            if (keywords.some(k => d.includes(k))) return 'Kanker';
            return 'Non Kanker';
        };

        let currentNo = 1;
        rows.forEach((row) => {
            // Add Patient Row
            sheet.addRow({
                no: currentNo++,
                nik: row.nik,
                name: row.patient_name,
                phone: row.phone || '-',
                address: row.address || '-',
                kelurahan: row.kelurahan || '-',
                kecamatan: row.kecamatan || '-',
                kabupaten: row.kabupaten || '-',
                provinsi: row.provinsi || '-',
                penghuni: 'Pasien',
                gender: row.gender || '-',
                dob: row.dob ? new Date(row.dob).toLocaleDateString('id-ID') : '-',
                age_cat: getAgeCategory(row.dob),
                education: '-', // Not in DB
                occupation: row.occupation || '-',
                diagnosis: row.diagnosis || '-',
                diag_cat: getDiseaseCategory(row.diagnosis),
                status: row.final_status ? 'Checked Out' : 'Masih dirawat',
                check_in: row.check_in_date ? new Date(row.check_in_date) : null,
                check_out: row.check_out_date ? new Date(row.check_out_date) : null
            });

            // Add Visitor Rows
            const visitors = visitorsMap[row.id] || [];
            visitors.forEach(v => {
                sheet.addRow({
                    no: currentNo++,
                    nik: v.nik,
                    name: v.name,
                    phone: v.phone || '-',
                    address: row.address || '-', // Default to patient's address
                    kelurahan: row.kelurahan || '-',
                    kecamatan: row.kecamatan || '-',
                    kabupaten: row.kabupaten || '-',
                    provinsi: row.provinsi || '-',
                    penghuni: 'Pendamping',
                    gender: '-', // Not in DB for visitors
                    dob: '-', // Not in DB for visitors
                    age_cat: '-',
                    education: '-',
                    occupation: '-',
                    diagnosis: '-',
                    diag_cat: '-',
                    status: row.final_status ? 'Checked Out' : 'Masih dirawat',
                    check_in: row.check_in_date ? new Date(row.check_in_date) : null,
                    check_out: row.check_out_date ? new Date(row.check_out_date) : null
                });
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getColumn('check_in').numFmt = 'dd/mm/yy';
        sheet.getColumn('check_out').numFmt = 'dd/mm/yy';

        // Apply stripes or colors if needed, but basic matching columns is priority
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const penghuni = row.getCell('penghuni').value;
                if (penghuni === 'Pasien') {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFF00' } // Yellow like in screenshot
                    };
                }
            }
        });

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
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const hasDate = from && to;
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status,
                al.km_start, al.km_end, al.driver_name, al.fuel_cost,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             ${hasDate ? 'WHERE DATE(al.departure_time) BETWEEN ? AND ?' : ''}
             ORDER BY al.departure_time DESC`,
            hasDate ? [from, to] : []
        );

        // Fetch documentation (patient logs) for these logs
        for (const row of rows) {
            const [patients] = await db.query(
                `SELECT p.name, p.registration_number, alp.document_path 
                 FROM AmbulanceLogPatients alp 
                 JOIN Patients p ON p.id = alp.patient_id 
                 WHERE alp.ambulance_log_id = ?`,
                [row.id]
            );
            row.documentation = patients;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Ambulans');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'No Polisi', key: 'plate_number', width: 16 },
            { header: 'Kendaraan', key: 'vehicle_model', width: 22 },
            { header: 'Driver', key: 'driver', width: 20 },
            { header: 'Tujuan', key: 'destination', width: 30 },
            { header: 'Nama Pasien', key: 'patient_name', width: 26 },
            { header: 'No Registrasi', key: 'registration_number', width: 20 },
            { header: 'Kondisi BBM', key: 'fuel', width: 15 },
            { header: 'Berangkat', key: 'departure', width: 20 },
            { header: 'Kembali', key: 'return', width: 20 },
            { header: 'KM Berangkat', key: 'km_start', width: 15 },
            { header: 'KM Pulang', key: 'km_end', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Dokumentasi', key: 'docs', width: 25 }
        ];

        rows.forEach((row, index) => {
            const docsList = row.documentation?.map(d => d.document_path ? 'Ada' : 'Tidak Ada').join(', ') || '-';
            
            sheet.addRow({
                no: index + 1,
                plate_number: row.plate_number,
                vehicle_model: row.vehicle_model,
                driver: row.driver_name || '-',
                destination: row.destination,
                patient_name: row.patient_name || '-',
                registration_number: row.registration_number || '-',
                fuel: row.fuel_cost || 0,
                departure: row.departure_time ? new Date(row.departure_time).toLocaleString('id-ID') : '-',
                return: row.return_time ? new Date(row.return_time).toLocaleString('id-ID') : '-',
                km_start: row.km_start || 0,
                km_end: row.km_end || 0,
                status: row.status === 'In-Journey' ? 'Dalam Perjalanan' : (row.status === 'Completed' ? 'Selesai' : row.status),
                docs: docsList
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        const fileLabel = from && to ? `${from}_sampai_${to}` : 'semua-data';
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="laporan-ambulans-${fileLabel}.xlsx"`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('exportAmbulanceUsage error:', error);
        res.status(500).json({ message: 'Gagal mengekspor laporan ambulans' });
    }
};
// GET /api/reports/dashboard-summary
// Ringkasan untuk dashboard: jumlah pasien, ketersediaan kamar, status ambulans
exports.getDashboardSummary = async (req, res) => {
    try {
        // Pasien aktif (masih dirawat)
        const [[{ active_patients }]] = await db.query(
            "SELECT COUNT(DISTINCT patient_id) AS active_patients FROM StayLogs WHERE final_status IS NULL"
        );
        // Total pasien terdaftar
        const [[{ total_patients }]] = await db.query(
            "SELECT COUNT(*) AS total_patients FROM Patients"
        );
        // Pasien pending verifikasi
        const [[{ pending_patients }]] = await db.query(
            "SELECT COUNT(*) AS pending_patients FROM PatientRegistrations WHERE status_verification = 'Pending'"
        );

        // Kamar: total beds & yang tersedia
        const [[{ total_beds }]] = await db.query(
            "SELECT COUNT(*) AS total_beds FROM Beds"
        );
        const [[{ available_beds }]] = await db.query(
            "SELECT COUNT(*) AS available_beds FROM Beds WHERE is_available = 1"
        );
        const [[{ total_rooms }]] = await db.query(
            "SELECT COUNT(*) AS total_rooms FROM Rooms"
        );

        // Ambulans per status
        const [ambulanceStatus] = await db.query(
            "SELECT status, COUNT(*) AS count FROM Ambulances GROUP BY status"
        );
        const ambulanceSummary = { Available: 0, 'In-Journey': 0, Maintenance: 0 };
        for (const row of ambulanceStatus) {
            ambulanceSummary[row.status] = Number(row.count);
        }
        const [[{ total_ambulances }]] = await db.query(
            "SELECT COUNT(*) AS total_ambulances FROM Ambulances"
        );

        res.json({
            patients: {
                active: Number(active_patients),
                total: Number(total_patients),
                pending: Number(pending_patients),
            },
            rooms: {
                total_rooms: Number(total_rooms),
                total_beds: Number(total_beds),
                available_beds: Number(available_beds),
                occupied_beds: Number(total_beds) - Number(available_beds),
            },
            ambulances: {
                total: Number(total_ambulances),
                available: ambulanceSummary['Available'],
                in_journey: ambulanceSummary['In-Journey'],
                maintenance: ambulanceSummary['Maintenance'],
            },
        });
    } catch (error) {
        console.error('getDashboardSummary error:', error);
        res.status(500).json({ message: 'Gagal mengambil ringkasan dashboard' });
    }
};

