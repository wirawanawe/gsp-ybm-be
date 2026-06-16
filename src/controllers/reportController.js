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
    const { date, start_date, end_date, final_status, date_type, name, room_id, bed_id } = req.query;
    // Backward compatibility: jika hanya ada ?date lama, pakai sebagai from/to
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const cacheKey = `report:patient-in-out:${JSON.stringify({ from, to, final_status, date_type, name, room_id, bed_id })}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        let whereClause = '1=1';
        const params = [];

        if (from && to) {
            if (date_type === 'check_in') {
                whereClause += ' AND DATE(s.check_in_date) BETWEEN ? AND ?';
                params.push(from, to);
            } else if (date_type === 'check_out') {
                whereClause += ' AND DATE(s.check_out_date) BETWEEN ? AND ?';
                params.push(from, to);
            } else {
                whereClause += ' AND ((DATE(s.check_in_date) BETWEEN ? AND ?) OR (DATE(s.check_out_date) BETWEEN ? AND ?))';
                params.push(from, to, from, to);
            }
        }
        if (final_status) {
            if (final_status === 'Masih dirawat' || final_status === 'null') {
                whereClause += ' AND s.final_status IS NULL';
            } else if (final_status === 'Aktif & Pulang') {
                whereClause += " AND (s.final_status IS NULL OR s.final_status = 'Sembuh')";
            } else {
                whereClause += ' AND s.final_status = ?';
                params.push(final_status);
            }
        }
        if (name) {
            whereClause += ' AND p.name LIKE ?';
            params.push(`%${name}%`);
        }
        if (room_id) {
            whereClause += ' AND r.id = ?';
            params.push(room_id);
        }
        if (bed_id) {
            whereClause += ' AND b.id = ?';
            params.push(bed_id);
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path, s.transfer_reason,
                p.name AS patient_name, p.registration_number, p.nik, p.gender, p.kabupaten, p.disease_category,
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
    const { date, start_date, end_date, date_type } = req.query;
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const cacheKey = `report:ambulance-usage:${JSON.stringify({ from, to, date_type })}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const hasDate = from && to;
        let dateWhereClause = '';
        const params = [];
        if (hasDate) {
            if (date_type === 'departure') {
                dateWhereClause = 'WHERE DATE(al.departure_time) BETWEEN ? AND ?';
                params.push(from, to);
            } else if (date_type === 'return') {
                dateWhereClause = 'WHERE DATE(al.return_time) BETWEEN ? AND ?';
                params.push(from, to);
            } else {
                dateWhereClause = 'WHERE (DATE(al.departure_time) BETWEEN ? AND ? OR DATE(al.return_time) BETWEEN ? AND ?)';
                params.push(from, to, from, to);
            }
        }
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status, al.km_start, al.km_end,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number, al.patient_id
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             ${dateWhereClause}
             ORDER BY al.departure_time DESC`,
            params
        );

        for (const row of rows) {
            const [patients] = await db.query(
                `SELECT p.id, p.name AS patient_name, p.registration_number, alp.destination, alp.document_path 
                 FROM AmbulanceLogPatients alp 
                 JOIN Patients p ON p.id = alp.patient_id 
                 WHERE alp.ambulance_log_id = ?`,
                [row.id]
            );
            if (patients.length === 0 && row.patient_id) {
                row.patients = [{
                    id: row.patient_id,
                    patient_name: row.patient_name,
                    registration_number: row.registration_number,
                    destination: row.destination
                }];
            } else {
                row.patients = patients;
            }
        }

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
    const { date, start_date, end_date, final_status, date_type, name } = req.query;
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        let whereClause = '1=1';
        const params = [];

        if (from && to) {
            if (date_type === 'check_in') {
                whereClause += ' AND DATE(s.check_in_date) BETWEEN ? AND ?';
                params.push(from, to);
            } else if (date_type === 'check_out') {
                whereClause += ' AND DATE(s.check_out_date) BETWEEN ? AND ?';
                params.push(from, to);
            } else {
                whereClause += ' AND ((DATE(s.check_in_date) BETWEEN ? AND ?) OR (DATE(s.check_out_date) BETWEEN ? AND ?))';
                params.push(from, to, from, to);
            }
        }
        if (final_status) {
            if (final_status === 'Masih dirawat' || final_status === 'null') {
                whereClause += ' AND s.final_status IS NULL';
            } else if (final_status === 'Aktif & Pulang') {
                whereClause += " AND (s.final_status IS NULL OR s.final_status = 'Sembuh')";
            } else {
                whereClause += ' AND s.final_status = ?';
                params.push(final_status);
            }
        }
        if (name) {
            whereClause += ' AND p.name LIKE ?';
            params.push(`%${name}%`);
        }

        const [rows] = await db.query(
            `SELECT 
                s.id, s.patient_id, s.bed_id, s.check_in_date, s.check_out_date, s.final_status,
                s.departure_photo_path, s.transfer_reason,
                p.name AS patient_name, p.registration_number, p.nik, p.dob, p.gender, p.phone, p.address,
                p.rt_rw, p.kelurahan, p.kecamatan, p.kabupaten, p.provinsi, p.diagnosis, p.occupation, p.income,
                p.age_category, p.education, p.disease_category, p.treatment_plan, p.rs_rujukan,
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
                `SELECT slv.stay_log_id, v.name, v.nik, v.relation, v.phone, v.gender, v.dob, 
                        v.age_category, v.education, v.occupation, v.address, v.rt_rw, v.kelurahan, 
                        v.kecamatan, v.kabupaten, v.provinsi
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

        // Fetch document status for these patients
        const patientIds = [...new Set(rows.map(r => r.patient_id))];
        let docsMap = {};
        if (patientIds.length > 0) {
            const [dRows] = await db.query(
                `SELECT patient_id, document_type FROM Documents WHERE patient_id IN (?)`,
                [patientIds]
            );
            dRows.forEach(d => {
                if (!docsMap[d.patient_id]) docsMap[d.patient_id] = new Set();
                docsMap[d.patient_id].add(d.document_type);
            });
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Pasien');

        sheet.columns = [
                        // PASIEN (20 cols: 1-20 / A-T)
            { header: 'No', key: 'no', width: 6 },
            { header: 'NIK (No. KTP)', key: 'p_nik', width: 20 },
            { header: 'Nama Pasien / Mustahik', key: 'p_name', width: 25 },
            { header: 'Jenis Kelamin', key: 'p_gender', width: 15 },
            { header: 'Tempat, Tanggal Lahir', key: 'p_dob', width: 20 },
            { header: 'Usia (Tahun)', key: 'p_age', width: 12 },
            { header: 'Kategori Usia', key: 'p_age_category', width: 15 },
            { header: 'Alamat Lengkap', key: 'p_address', width: 30 },
            { header: 'RT/RW', key: 'p_rtrw', width: 10 },
            { header: 'Kelurahan/Desa', key: 'p_kelurahan', width: 18 },
            { header: 'Kecamatan', key: 'p_kecamatan', width: 18 },
            { header: 'Kab/Kota', key: 'p_kabupaten', width: 18 },
            { header: 'Provinsi', key: 'p_provinsi', width: 18 },
            { header: 'No HP/Telepon', key: 'p_phone', width: 18 },
            { header: 'Pendidikan', key: 'p_education', width: 15 },
            { header: 'Pekerjaan', key: 'p_occupation', width: 18 },
            { header: 'Kategori', key: 'p_kategori', width: 15 },
            { header: 'Diagnosa Medis', key: 'p_diagnosis', width: 25 },
            { header: 'Kategori Penyakit', key: 'p_disease_category', width: 20 },
            { header: 'Rencana Tindakan', key: 'p_treatment', width: 25 },
            { header: 'Kelengkapan Data (Dokumen)', key: 'p_docs', width: 40 },

            // PENDAMPING 1 (15 cols: 22-36 / V-AJ)
            { header: 'NIK', key: 'v1_nik', width: 20 },
            { header: 'Nama Pendamping', key: 'v1_name', width: 25 },
            { header: 'Hubungan dengan Pasien', key: 'v1_relation', width: 20 },
            { header: 'Jenis Kelamin', key: 'v1_gender', width: 15 },
            { header: 'Tempat, Tanggal Lahir', key: 'v1_dob', width: 20 },
            { header: 'Usia (Tahun)', key: 'v1_age', width: 12 },
            { header: 'Alamat Lengkap', key: 'v1_address', width: 30 },
            { header: 'RT/RW', key: 'v1_rtrw', width: 10 },
            { header: 'Kelurahan/Desa', key: 'v1_kelurahan', width: 18 },
            { header: 'Kecamatan', key: 'v1_kecamatan', width: 18 },
            { header: 'Kab/Kota', key: 'v1_kabupaten', width: 18 },
            { header: 'Provinsi', key: 'v1_provinsi', width: 18 },
            { header: 'No HP/Telepon', key: 'v1_phone', width: 18 },
            { header: 'Pendidikan', key: 'v1_education', width: 15 },
            { header: 'Pekerjaan', key: 'v1_occupation', width: 18 },

            // PENDAMPING 2 (15 cols: 36-50 / AJ-AX)
            { header: 'NIK', key: 'v2_nik', width: 20 },
            { header: 'Nama Pendamping', key: 'v2_name', width: 25 },
            { header: 'Hubungan dengan Pasien', key: 'v2_relation', width: 20 },
            { header: 'Jenis Kelamin', key: 'v2_gender', width: 15 },
            { header: 'Tempat, Tanggal Lahir', key: 'v2_dob', width: 20 },
            { header: 'Usia (Tahun)', key: 'v2_age', width: 12 },
            { header: 'Alamat Lengkap', key: 'v2_address', width: 30 },
            { header: 'RT/RW', key: 'v2_rtrw', width: 10 },
            { header: 'Kelurahan/Desa', key: 'v2_kelurahan', width: 18 },
            { header: 'Kecamatan', key: 'v2_kecamatan', width: 18 },
            { header: 'Kab/Kota', key: 'v2_kabupaten', width: 18 },
            { header: 'Provinsi', key: 'v2_provinsi', width: 18 },
            { header: 'No HP/Telepon', key: 'v2_phone', width: 18 },
            { header: 'Pendidikan', key: 'v2_education', width: 15 },
            { header: 'Pekerjaan', key: 'v2_occupation', width: 18 },

            // RUMAH SINGGAH (7 cols: 51-57)
            { header: 'ID', key: 'rs_id', width: 15 },
            { header: 'RS Rujukan / Asal Faskes', key: 'rs_asal', width: 25 },
            { header: 'Tgl Masuk', key: 'rs_masuk', width: 15 },
            { header: 'Tgl Keluar', key: 'rs_keluar', width: 15 },
            { header: 'Lama Inap (Hari)', key: 'rs_lama', width: 15 },
            { header: 'Status Kepulangan', key: 'rs_status', width: 20 },
            { header: 'Keterangan', key: 'rs_ket', width: 20 },

            { header: 'Nomor Kamar', key: 'f_kamar', width: 15 },
            { header: 'Nomor Bed', key: 'f_bed', width: 15 }
        ];

        // Insert group header row
        sheet.spliceRows(1, 0, []); 
        const groupHeaderRow = sheet.getRow(1);
        
        groupHeaderRow.getCell(1).value = 'PASIEN';
        sheet.mergeCells(1, 1, 1, 21);
        groupHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEE6F0' } };
        groupHeaderRow.getCell(1).font = { bold: true, color: { argb: 'FF000000' } };

        groupHeaderRow.getCell(22).value = 'PENDAMPING 1';
        sheet.mergeCells(1, 22, 1, 36);
        groupHeaderRow.getCell(22).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        groupHeaderRow.getCell(22).font = { bold: true, color: { argb: 'FF000000' } };

        groupHeaderRow.getCell(37).value = 'PENDAMPING 2';
        sheet.mergeCells(1, 37, 1, 51);
        groupHeaderRow.getCell(37).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        groupHeaderRow.getCell(37).font = { bold: true, color: { argb: 'FF000000' } };

        groupHeaderRow.getCell(52).value = 'RUMAH SINGGAH';
        sheet.mergeCells(1, 52, 1, 58);
        groupHeaderRow.getCell(52).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
        groupHeaderRow.getCell(52).font = { bold: true, color: { argb: 'FF000000' } };

        groupHeaderRow.getCell(59).value = 'FASILITAS';
        sheet.mergeCells(1, 59, 1, 60);
        groupHeaderRow.getCell(59).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        groupHeaderRow.getCell(59).font = { bold: true, color: { argb: 'FF000000' } };

        groupHeaderRow.height = 25;
        groupHeaderRow.eachCell((cell) => {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const colHeaderRow = sheet.getRow(2);
        colHeaderRow.font = { bold: true };
        colHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        colHeaderRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        const getAge = (dob) => {
            if (!dob) return '-';
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            return age >= 0 ? age : '-';
        };

        const calculateDays = (inDate, outDate) => {
            if (!inDate) return '-';
            const end = outDate ? new Date(outDate) : new Date();
            const start = new Date(inDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            return diffDays === 0 ? 1 : diffDays;
        };

        let currentNo = 1;
        rows.forEach((row) => {
            const visitors = visitorsMap[row.id] || [];
            
                        const pData = {
                no: currentNo++,
                p_nik: row.nik || '-',
                p_name: row.patient_name || '-',
                p_gender: row.gender || '-',
                p_dob: row.dob ? new Date(row.dob).toLocaleDateString('id-ID') : '-',
                p_age: getAge(row.dob),
                p_age_category: row.age_category || '-',
                p_address: row.address || '-',
                p_rtrw: row.rt_rw || '-',
                p_kelurahan: row.kelurahan || '-',
                p_kecamatan: row.kecamatan || '-',
                p_kabupaten: row.kabupaten || '-',
                p_provinsi: row.provinsi || '-',
                p_phone: row.phone || '-',
                p_education: row.education || '-',
                p_occupation: row.occupation || '-',
                p_kategori: 'Mustahik', // Defaulting as this is YBM
                p_diagnosis: row.diagnosis || '-',
                p_disease_category: row.disease_category || '-',
                p_treatment: row.treatment_plan || '-',
                
                rs_id: `RS-${row.id.toString().padStart(4, '0')}`,
                rs_asal: row.rs_rujukan || '-',
                rs_masuk: row.check_in_date ? new Date(row.check_in_date) : null,
                rs_keluar: row.check_out_date ? new Date(row.check_out_date) : null,
                rs_lama: calculateDays(row.check_in_date, row.check_out_date),
                rs_status: row.final_status || 'Masih dirawat',
                rs_ket: '-',

                f_kamar: row.room_number || '-',
                f_bed: row.bed_number || '-'
            };

            // Calculate document completeness
            const requiredDocs = ['KTP', 'KK', 'BPJS', 'SKTM', 'Rujukan', 'Foto'];
            const patientDocs = docsMap[row.patient_id] || new Set();
            const docsStatus = requiredDocs.map(doc => {
                return `${doc}: ${patientDocs.has(doc) ? '✅' : '❌'}`;
            }).join(', ');
            pData.p_docs = docsStatus;

            const v1 = visitors[0];
            const v2 = visitors[1];

            const v1Data = v1 ? {
                v1_nik: v1.nik || '-',
                v1_name: v1.name || '-',
                v1_relation: v1.relation || '-',
                v1_gender: v1.gender || '-',
                v1_dob: v1.dob ? new Date(v1.dob).toLocaleDateString('id-ID') : '-',
                v1_age: getAge(v1.dob),
                v1_address: v1.address || '-',
                v1_rtrw: v1.rt_rw || '-',
                v1_kelurahan: v1.kelurahan || '-',
                v1_kecamatan: v1.kecamatan || '-',
                v1_kabupaten: v1.kabupaten || '-',
                v1_provinsi: v1.provinsi || '-',
                v1_phone: v1.phone || '-',
                v1_education: v1.education || '-',
                v1_occupation: v1.occupation || '-'
            } : {
                v1_nik: '-', v1_name: '-', v1_relation: '-', v1_gender: '-', v1_dob: '-', v1_age: '-',
                v1_address: '-', v1_rtrw: '-', v1_kelurahan: '-', v1_kecamatan: '-', v1_kabupaten: '-', 
                v1_provinsi: '-', v1_phone: '-', v1_education: '-', v1_occupation: '-'
            };

            const v2Data = v2 ? {
                v2_nik: v2.nik || '-',
                v2_name: v2.name || '-',
                v2_relation: v2.relation || '-',
                v2_gender: v2.gender || '-',
                v2_dob: v2.dob ? new Date(v2.dob).toLocaleDateString('id-ID') : '-',
                v2_age: getAge(v2.dob),
                v2_address: v2.address || '-',
                v2_rtrw: v2.rt_rw || '-',
                v2_kelurahan: v2.kelurahan || '-',
                v2_kecamatan: v2.kecamatan || '-',
                v2_kabupaten: v2.kabupaten || '-',
                v2_provinsi: v2.provinsi || '-',
                v2_phone: v2.phone || '-',
                v2_education: v2.education || '-',
                v2_occupation: v2.occupation || '-'
            } : {
                v2_nik: '-', v2_name: '-', v2_relation: '-', v2_gender: '-', v2_dob: '-', v2_age: '-',
                v2_address: '-', v2_rtrw: '-', v2_kelurahan: '-', v2_kecamatan: '-', v2_kabupaten: '-', 
                v2_provinsi: '-', v2_phone: '-', v2_education: '-', v2_occupation: '-'
            };

            sheet.addRow({
                ...pData,
                ...v1Data,
                ...v2Data
            });
        });

        // Add thin borders to all data and header cells
        sheet.eachRow((row) => {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
        });

        // Specific alignment for address/name columns
        sheet.getColumn('p_name').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        sheet.getColumn('p_address').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        sheet.getColumn('rs_asal').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        sheet.getColumn('rs_masuk').numFmt = 'dd/mm/yyyy';
        sheet.getColumn('rs_keluar').numFmt = 'dd/mm/yyyy';

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
    const { date, start_date, end_date, date_type } = req.query;
    let from = start_date || date || '';
    let to = end_date || date || '';
    if (from && !to) to = from;
    if (to && !from) from = to;

    try {
        const hasDate = from && to;
        let dateWhereClause = '';
        const params = [];
        if (hasDate) {
            if (date_type === 'departure') {
                dateWhereClause = 'WHERE DATE(al.departure_time) BETWEEN ? AND ?';
                params.push(from, to);
            } else if (date_type === 'return') {
                dateWhereClause = 'WHERE DATE(al.return_time) BETWEEN ? AND ?';
                params.push(from, to);
            } else {
                dateWhereClause = 'WHERE (DATE(al.departure_time) BETWEEN ? AND ? OR DATE(al.return_time) BETWEEN ? AND ?)';
                params.push(from, to, from, to);
            }
        }
        const [rows] = await db.query(
            `SELECT 
                al.id, al.ambulance_id, al.destination, al.departure_time, al.return_time, al.status,
                al.km_start, al.km_end, al.driver_name, al.fuel_cost, al.fuel_condition, al.fuel_filled,
                a.plate_number, a.vehicle_model,
                p.name AS patient_name, p.registration_number, al.patient_id
             FROM AmbulanceLogs al
             JOIN Ambulances a ON a.id = al.ambulance_id
             LEFT JOIN Patients p ON p.id = al.patient_id
             ${dateWhereClause}
             ORDER BY al.departure_time DESC`,
            params
        );

        // Fetch patients for these logs
        for (const row of rows) {
            const [patients] = await db.query(
                `SELECT p.name AS patient_name, p.registration_number, alp.destination, alp.document_path 
                 FROM AmbulanceLogPatients alp 
                 JOIN Patients p ON p.id = alp.patient_id 
                 WHERE alp.ambulance_log_id = ?`,
                [row.id]
            );
            if (patients.length === 0 && row.patient_id) {
                row.patients = [{
                    patient_name: row.patient_name,
                    registration_number: row.registration_number,
                    destination: row.destination,
                    document_path: null
                }];
            } else {
                row.patients = patients;
            }
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Ambulans');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'No Polisi', key: 'plate_number', width: 15 },
            { header: 'Kendaraan', key: 'vehicle_model', width: 18 },
            { header: 'Driver', key: 'driver', width: 15 },
            { header: 'Tujuan', key: 'destination', width: 30 },
            { header: 'Nama Pasien', key: 'patient_name', width: 25 },
            { header: 'No Registrasi', key: 'registration_number', width: 22 },
            { header: 'Kondisi BBM (Berangkat)', key: 'fuel_cond', width: 18 },
            { header: 'Isi BBM (Berangkat)', key: 'fuel_filled', width: 18 },
            { header: 'Berangkat', key: 'departure', width: 20 },
            { header: 'Kembali', key: 'return', width: 20 },
            { header: 'KM Berangkat', key: 'km_start', width: 15 },
            { header: 'KM Pulang', key: 'km_end', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Dokumentasi', key: 'docs', width: 15 }
        ];

        rows.forEach((row, index) => {
            const patientsList = row.patients?.map(p => p.patient_name).join('\n') || row.patient_name || '-';
            const regList = row.patients?.map(p => p.registration_number || '-').join('\n') || row.registration_number || '-';
            const destList = row.patients?.map(p => row.patients.length > 1 ? `${p.destination || row.destination || '-'} (${p.patient_name})` : (p.destination || row.destination || '-')).join('\n') || row.destination || '-';
            const docsList = row.patients?.map(p => p.document_path ? 'Ada' : 'Tidak Ada').join('\n') || '-';
            
            sheet.addRow({
                no: index + 1,
                plate_number: row.plate_number,
                vehicle_model: row.vehicle_model,
                driver: row.driver_name || '-',
                destination: destList,
                patient_name: patientsList,
                registration_number: regList,
                fuel_cond: row.fuel_condition || '-',
                fuel_filled: row.fuel_filled || '-',
                departure: row.departure_time ? new Date(row.departure_time).toLocaleString('id-ID') : '-',
                return: row.return_time ? new Date(row.return_time).toLocaleString('id-ID') : '-',
                km_start: row.km_start || 0,
                km_end: row.km_end || 0,
                status: row.status === 'In-Journey' ? 'Dalam Perjalanan' : (row.status === 'Completed' ? 'Selesai' : row.status),
                docs: docsList
            });
        });

        // Header Styling
        const headerRow = sheet.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDEE6F0' }
            };
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Data Cell Styling
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 1) return;
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
        });
        
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
        const { startDate, endDate } = req.query;
        let dateConditionP = "";
        let dateConditionS = "";
        let dateConditionPR = "";
        const paramsP = [];
        const paramsS = [];
        const paramsPR = [];
        
        if (startDate && endDate) {
            dateConditionP = " AND created_at >= ? AND created_at <= ?";
            dateConditionS = " AND s.check_in_date >= ? AND s.check_in_date <= ?";
            dateConditionPR = " AND created_at >= ? AND created_at <= ?";
            const startStr = startDate + " 00:00:00";
            const endStr = endDate + " 23:59:59";
            paramsP.push(startStr, endStr);
            paramsS.push(startStr, endStr);
            paramsPR.push(startStr, endStr);
        }

        // Pasien aktif (masih dirawat) & gender split
        const [activePatientsRows] = await db.query(
            `SELECT p.gender, COUNT(DISTINCT s.patient_id) as count
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             WHERE s.final_status IS NULL${dateConditionS}
             GROUP BY p.gender`,
             [...paramsS]
        );
        let active_patients = 0;
        const active_patients_gender = { 'Laki-laki': 0, 'Perempuan': 0 };
        for (const row of activePatientsRows) {
            const count = Number(row.count);
            active_patients += count;
            if (row.gender === 'Laki-laki' || row.gender === 'Laki-Laki') active_patients_gender['Laki-laki'] += count;
            if (row.gender === 'Perempuan') active_patients_gender['Perempuan'] += count;
        }

        // Pasien pulang & gender split
        const [dischargedPatientsRows] = await db.query(
            `SELECT p.gender, COUNT(DISTINCT s.patient_id) as count
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             WHERE s.final_status IS NOT NULL${dateConditionS}
             GROUP BY p.gender`,
             [...paramsS]
        );
        let discharged_patients = 0;
        const discharged_patients_gender = { 'Laki-laki': 0, 'Perempuan': 0 };
        for (const row of dischargedPatientsRows) {
            const count = Number(row.count);
            discharged_patients += count;
            if (row.gender === 'Laki-laki' || row.gender === 'Laki-Laki') discharged_patients_gender['Laki-laki'] += count;
            if (row.gender === 'Perempuan') discharged_patients_gender['Perempuan'] += count;
        }

        // Total pasien terdaftar
        const [[{ total_patients }]] = await db.query(
            `SELECT COUNT(*) AS total_patients FROM Patients WHERE 1=1${dateConditionP}`,
            [...paramsP]
        );
        // Pasien pending verifikasi
        const [[{ pending_patients }]] = await db.query(
            `SELECT COUNT(*) AS pending_patients FROM PatientRegistrations WHERE status_verification = 'Pending'${dateConditionPR}`,
            [...paramsPR]
        );

        // Distribusi Jenis Kelamin
        const [genderRows] = await db.query(
            `SELECT gender, COUNT(*) AS count FROM Patients WHERE 1=1${dateConditionP} GROUP BY gender`,
            [...paramsP]
        );
        const gender_distribution = { 'Laki-laki': 0, 'Perempuan': 0 };
        for (const row of genderRows) {
            if (row.gender === 'Laki-laki' || row.gender === 'Laki-Laki') gender_distribution['Laki-laki'] += Number(row.count);
            if (row.gender === 'Perempuan') gender_distribution['Perempuan'] += Number(row.count);
        }

        // Kategori Penyakit
        const [diseaseRows] = await db.query(
            `SELECT disease_category, COUNT(*) AS count FROM Patients WHERE disease_category IS NOT NULL AND disease_category != ''${dateConditionP} GROUP BY disease_category ORDER BY count DESC`,
            [...paramsP]
        );
        const disease_categories = diseaseRows.map(row => ({ category: row.disease_category, count: Number(row.count) }));

        // Asal Wilayah (Provinsi)
        const [provinsiRows] = await db.query(
            `SELECT provinsi, COUNT(*) AS count FROM Patients WHERE provinsi IS NOT NULL AND provinsi != ''${dateConditionP} GROUP BY provinsi ORDER BY count DESC`,
            [...paramsP]
        );
        const patient_provinces = provinsiRows.map(row => ({ province: row.provinsi, count: Number(row.count) }));

        // Golongan Usia
        const [ageRows] = await db.query(
            `SELECT age_category, COUNT(*) AS count FROM Patients WHERE age_category IS NOT NULL AND age_category != ''${dateConditionP} GROUP BY age_category ORDER BY count DESC`,
            [...paramsP]
        );
        const age_categories = ageRows.map(row => ({ category: row.age_category, count: Number(row.count) }));

        // Tingkat Pendidikan
        const [eduRows] = await db.query(
            `SELECT education, COUNT(*) AS count FROM Patients WHERE education IS NOT NULL AND education != ''${dateConditionP} GROUP BY education ORDER BY count DESC`,
            [...paramsP]
        );
        const educations = eduRows.map(row => ({ level: row.education, count: Number(row.count) }));

        // Pekerjaan (Jenis Pendidikan/Pekerjaan)
        const [occRows] = await db.query(
            `SELECT occupation, COUNT(*) AS count FROM Patients WHERE occupation IS NOT NULL AND occupation != ''${dateConditionP} GROUP BY occupation ORDER BY count DESC`,
            [...paramsP]
        );
        const occupations = occRows.map(row => ({ type: row.occupation, count: Number(row.count) }));
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

        // Penunggu aktif (pendamping dari pasien yang masih dirawat)
        const [[{ active_visitors }]] = await db.query(
            "SELECT COUNT(DISTINCT visitor_id) AS active_visitors FROM StayLogVisitors slv JOIN StayLogs sl ON slv.stay_log_id = sl.id WHERE sl.final_status IS NULL"
        );
        // Total penunggu terdaftar
        const [[{ total_visitors }]] = await db.query(
            "SELECT COUNT(*) AS total_visitors FROM Visitors"
        );

        res.json({
            patients: {
                active: Number(active_patients),
                active_gender: active_patients_gender,
                discharged: Number(discharged_patients),
                discharged_gender: discharged_patients_gender,
                total: Number(total_patients),
                pending: Number(pending_patients),
                gender_distribution,
                disease_categories,
                provinces: patient_provinces,
                age_categories,
                educations,
                occupations
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
            visitors: {
                active: Number(active_visitors),
                total: Number(total_visitors),
            },
        });
    } catch (error) {
        console.error('getDashboardSummary error:', error);
        res.status(500).json({ message: 'Gagal mengambil ringkasan dashboard' });
    }
};

