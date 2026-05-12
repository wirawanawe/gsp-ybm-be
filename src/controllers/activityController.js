const db = require('../config/db');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ─── ACTIVITY SCHEDULES ───────────────────────────────────────────────────────

/** GET /api/activities — list jadwal (optional: ?type=Tahsin|Taklim|Kegiatan Harian) */
exports.getSchedules = async (req, res) => {
    try {
        // Auto-deactivate Taklim one-time schedules that have passed
        await db.query(`
            UPDATE ActivitySchedules 
            SET is_active = 0 
            WHERE type = 'Taklim' 
              AND is_recurring = 0 
              AND scheduled_date < CURDATE() 
              AND is_active = 1
        `);

        const { type, is_active } = req.query;
        let sql = 'SELECT * FROM ActivitySchedules WHERE 1=1';
        const params = [];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active); }
        sql += ' ORDER BY day_of_week, start_time, scheduled_date DESC';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getSchedules error:', err);
        res.status(500).json({ message: 'Gagal mengambil data jadwal' });
    }
};

/** POST /api/activities */
exports.createSchedule = async (req, res) => {
    try {
        const {
            type, title, day_of_week, scheduled_date, start_time, end_time,
            location, facilitator, notes, is_recurring, is_active
        } = req.body;

        if (!type || !title) {
            return res.status(400).json({ message: 'type dan title wajib diisi' });
        }

        const [result] = await db.query(
            `INSERT INTO ActivitySchedules
             (type, title, day_of_week, scheduled_date, start_time, end_time,
              location, facilitator, notes, is_recurring, is_active, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [type, title, day_of_week || null, scheduled_date || null,
             start_time || null, end_time || null,
             location || null, facilitator || null, notes || null,
             is_recurring ?? 0, is_active ?? 1,
             req.user?.id || null]
        );
        const [rows] = await db.query('SELECT * FROM ActivitySchedules WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('createSchedule error:', err);
        res.status(500).json({ message: 'Gagal menambah jadwal' });
    }
};

/** PUT /api/activities/:id */
exports.updateSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            type, title, day_of_week, scheduled_date, start_time, end_time,
            location, facilitator, notes, is_recurring, is_active
        } = req.body;

        await db.query(
            `UPDATE ActivitySchedules SET
             type=?, title=?, day_of_week=?, scheduled_date=?,
             start_time=?, end_time=?, location=?, facilitator=?,
             notes=?, is_recurring=?, is_active=?, updated_by=?
             WHERE id=?`,
            [type, title, day_of_week || null, scheduled_date || null,
             start_time || null, end_time || null,
             location || null, facilitator || null, notes || null,
             is_recurring ?? 0, is_active ?? 1,
             req.user?.id || null, id]
        );
        const [rows] = await db.query('SELECT * FROM ActivitySchedules WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        console.error('updateSchedule error:', err);
        res.status(500).json({ message: 'Gagal mengupdate jadwal' });
    }
};

/** DELETE /api/activities/:id */
exports.deleteSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT id FROM ActivitySchedules WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        await db.query('DELETE FROM ActivitySchedules WHERE id = ?', [id]);
        res.json({ message: 'Jadwal berhasil dihapus' });
    } catch (err) {
        console.error('deleteSchedule error:', err);
        res.status(500).json({ message: 'Gagal menghapus jadwal' });
    }
};

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────

/** GET /api/activities/:id/attendance — list presensi suatu jadwal */
exports.getAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { attendance_date } = req.query;
        let sql = `
            SELECT a.*, p.name AS patient_name
            FROM ActivityAttendance a
            LEFT JOIN Patients p ON a.patient_id = p.id
            WHERE a.schedule_id = ?
        `;
        const params = [id];
        if (attendance_date) { sql += ' AND a.attendance_date = ?'; params.push(attendance_date); }
        sql += ' ORDER BY a.participant_name';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getAttendance error:', err);
        res.status(500).json({ message: 'Gagal mengambil data presensi' });
    }
};

/** POST /api/activities/:id/attendance — catat presensi (single or bulk) */
exports.createAttendance = async (req, res) => {
    try {
        const { id: schedule_id } = req.params;
        const { records } = req.body; // array of { participant_name, participant_type, patient_id, attendance_date, status, notes }

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ message: 'records array wajib diisi' });
        }

        const values = records.map(r => [
            schedule_id,
            r.participant_name,
            r.participant_type || 'Umum',
            r.patient_id || null,
            r.attendance_date,
            r.status || 'Hadir',
            r.notes || null,
            req.user?.id || null
        ]);

        await db.query(
            `INSERT INTO ActivityAttendance
             (schedule_id, participant_name, participant_type, patient_id,
              attendance_date, status, notes, created_by)
             VALUES ?`,
            [values]
        );
        res.status(201).json({ message: `${records.length} data presensi berhasil disimpan` });
    } catch (err) {
        console.error('createAttendance error:', err);
        res.status(500).json({ message: 'Gagal menyimpan presensi' });
    }
};

/** PUT /api/activities/:id/attendance/:attendId */
exports.updateAttendance = async (req, res) => {
    try {
        const { attendId } = req.params;
        const { participant_name, participant_type, status, notes } = req.body;
        await db.query(
            `UPDATE ActivityAttendance SET
             participant_name=?, participant_type=?, status=?, notes=?, updated_by=?
             WHERE id=?`,
            [participant_name, participant_type, status, notes || null, req.user?.id || null, attendId]
        );
        res.json({ message: 'Presensi diupdate' });
    } catch (err) {
        console.error('updateAttendance error:', err);
        res.status(500).json({ message: 'Gagal update presensi' });
    }
};

/** DELETE /api/activities/:schedId/attendance/:attendId */
exports.deleteAttendance = async (req, res) => {
    try {
        const { attendId } = req.params;
        await db.query('DELETE FROM ActivityAttendance WHERE id = ?', [attendId]);
        res.json({ message: 'Data presensi dihapus' });
    } catch (err) {
        console.error('deleteAttendance error:', err);
        res.status(500).json({ message: 'Gagal menghapus presensi' });
    }
};

/** GET /api/activities/attendance/summary — statistik per jadwal */
exports.getAttendanceSummary = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                s.id, s.type, s.title,
                COUNT(DISTINCT a.attendance_date) AS total_sessions,
                COUNT(a.id) AS total_records,
                SUM(CASE WHEN a.status = 'Hadir' THEN 1 ELSE 0 END) AS total_hadir
            FROM ActivitySchedules s
            LEFT JOIN ActivityAttendance a ON s.id = a.schedule_id
            WHERE s.is_active = 1
            GROUP BY s.id, s.type, s.title
            ORDER BY s.type, s.title
        `);
        res.json(rows);
    } catch (err) {
        console.error('getAttendanceSummary error:', err);
        res.status(500).json({ message: 'Gagal mengambil summary presensi' });
    }
};

/** Helper: format Date sebagai 'YYYY-MM-DD' berdasarkan LOCAL timezone server (bukan UTC) */
function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** GET /api/activities/upcoming — jadwal kegiatan 7 hari ke depan (untuk dashboard) */
exports.getUpcomingSchedules = async (req, res) => {
    try {
        // Auto-deactivate Taklim one-time schedules that have passed
        await db.query(`
            UPDATE ActivitySchedules 
            SET is_active = 0 
            WHERE type = 'Taklim' 
              AND is_recurring = 0 
              AND scheduled_date < CURDATE() 
              AND is_active = 1
        `);

        // Hari ini dalam angka (0=Minggu, 1=Senin, ..., 6=Sabtu) — pakai LOCAL time server
        const today = new Date();
        const todayNum = today.getDay(); // JS: 0=Sun
        const todayMysql = todayNum + 1; // MySQL DAYOFWEEK: 1=Sun, ..., 7=Sat

        // Buat tanggal awal (hari ini tanpa jam) dan akhir (6 hari ke depan)
        // PENTING: pakai localDateStr agar tidak terkonversi ke UTC (bisa geser -1 hari di WIB)
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const startDate = localDateStr(todayStart);
        const endOfWeek = new Date(todayStart);
        endOfWeek.setDate(todayStart.getDate() + 6);
        const endDate = localDateStr(endOfWeek);

        // Ambil jadwal recurring (berdasar hari) ATAU jadwal spesifik dalam 7 hari ke depan
        const [rows] = await db.query(`
            SELECT id, type, title, day_of_week, scheduled_date, start_time, end_time,
                   location, facilitator, notes, is_recurring, is_active
            FROM ActivitySchedules
            WHERE is_active = 1
              AND (
                (is_recurring = 1 AND day_of_week IS NOT NULL)
                OR (is_recurring = 0 AND scheduled_date BETWEEN ? AND ?)
              )
            ORDER BY FIELD(type,'Tahsin','Taklim','Kegiatan Harian'), day_of_week, start_time
        `, [startDate, endDate]);

        // Map nama hari Indonesia ke angka MySQL DAYOFWEEK
        const dayNameToMysql = {
            'Minggu': 1, 'Senin': 2, 'Selasa': 3, 'Rabu': 4,
            'Kamis': 5, 'Jumat': 6, 'Sabtu': 7
        };

        const enriched = rows.map((r) => {
            if (r.is_recurring && r.day_of_week) {
                const targetMysql = dayNameToMysql[r.day_of_week] != null ? dayNameToMysql[r.day_of_week] : null;
                let daysUntil = 0;
                if (targetMysql !== null) {
                    daysUntil = (targetMysql - todayMysql + 7) % 7;
                }
                const nextDate = new Date(todayStart);
                nextDate.setDate(todayStart.getDate() + daysUntil);
                // Gunakan localDateStr agar tidak geser karena konversi UTC
                return { ...r, next_date: localDateStr(nextDate), days_until: daysUntil };
            }
            // One-time schedule: hitung selisih hari dari hari ini (local)
            const schedDate = r.scheduled_date ? new Date(r.scheduled_date) : null;
            let daysUntil = null;
            let nextDateStr = null;
            if (schedDate) {
                // Normalisasi ke local midnight untuk perbandingan akurat
                const schedLocal = new Date(schedDate.getFullYear(), schedDate.getMonth(), schedDate.getDate());
                daysUntil = Math.round((schedLocal.getTime() - todayStart.getTime()) / 86400000);
                nextDateStr = localDateStr(schedLocal);
            }
            return { ...r, next_date: nextDateStr, days_until: daysUntil };
        });

        // Urutkan berdasarkan days_until asc, lalu start_time
        enriched.sort((a, b) => {
            const da = a.days_until != null ? a.days_until : 99;
            const db_ = b.days_until != null ? b.days_until : 99;
            if (da !== db_) return da - db_;
            return (a.start_time || '').localeCompare(b.start_time || '');
        });

        res.json(enriched);
    } catch (err) {
        console.error('getUpcomingSchedules error:', err);
        res.status(500).json({ message: 'Gagal mengambil jadwal mendatang' });
    }
};


/** GET /api/reports/activity — Laporan kegiatan & presensi (filtered by date) */
exports.getActivityReport = async (req, res) => {
    try {
        const { start_date, end_date, activity_id } = req.query;
        let sql = `
            SELECT a.*, CAST(a.attendance_date AS CHAR) as att_date_str, s.title AS activity_title, s.type AS activity_type, p.name AS patient_name
            FROM ActivityAttendance a
            JOIN ActivitySchedules s ON a.schedule_id = s.id
            LEFT JOIN Patients p ON a.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (start_date) { sql += ' AND a.attendance_date >= ?'; params.push(start_date); }
        if (end_date)   { sql += ' AND a.attendance_date <= ?'; params.push(end_date); }
        if (activity_id) { sql += ' AND a.schedule_id = ?'; params.push(activity_id); }
        
        sql += ' ORDER BY s.title ASC, a.attendance_date ASC';
        
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('getActivityReport error:', err);
        res.status(500).json({ message: 'Gagal mengambil laporan kegiatan' });
    }
};

/** GET /api/reports/activity/export — Export laporan kegiatan ke Excel */
exports.exportActivityReport = async (req, res) => {
    try {
        const { start_date, end_date, activity_id } = req.query;
        let sql = `
            SELECT a.*, CAST(a.attendance_date AS CHAR) as att_date_str, s.title AS activity_title, s.type AS activity_type, p.name AS patient_name
            FROM ActivityAttendance a
            JOIN ActivitySchedules s ON a.schedule_id = s.id
            LEFT JOIN Patients p ON a.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (start_date) { sql += ' AND a.attendance_date >= ?'; params.push(start_date); }
        if (end_date)   { sql += ' AND a.attendance_date <= ?'; params.push(end_date); }
        if (activity_id) { sql += ' AND a.schedule_id = ?'; params.push(activity_id); }
        
        sql += ' ORDER BY s.title ASC, a.attendance_date ASC';
        
        const [rows] = await db.query(sql, params);
        
        // Fetch documentation for these activities
        const scheduleIds = [...new Set(rows.map(r => r.schedule_id))];
        let docsMap = {};
        if (scheduleIds.length > 0) {
            const [docRows] = await db.query(
                `SELECT activity_id, file_url, created_at, CAST(activity_date AS CHAR) as act_date_str 
                 FROM Documentation 
                 WHERE activity_id IN (?) AND file_type = 'photo'
                 ORDER BY created_at ASC`,
                [scheduleIds]
            );

            // Fetch ALL attendance dates for these activities to ensure fallback mapping is accurate
            // regardless of the current date filters applied to the report.
            const [allAttendanceRows] = await db.query(
                `SELECT schedule_id, CAST(attendance_date AS CHAR) as att_date_str 
                 FROM ActivityAttendance 
                 WHERE schedule_id IN (?)`,
                [scheduleIds]
            );

            const attendanceDatesPerSchedule = {};
            allAttendanceRows.forEach(r => {
                if (!attendanceDatesPerSchedule[r.schedule_id]) {
                    attendanceDatesPerSchedule[r.schedule_id] = new Set();
                }
                attendanceDatesPerSchedule[r.schedule_id].add(r.att_date_str);
            });

            docRows.forEach(d => {
                let dateKey = null;
                const docActivityId = String(d.activity_id);

                if (d.act_date_str) {
                    dateKey = d.act_date_str;
                } else {
                    // Fallback to the closest attendance date on or before created_at
                    const createdDate = new Date(d.created_at);
                    const scheduleDates = Array.from(attendanceDatesPerSchedule[d.activity_id] || []);
                    
                    // Sort descending (latest first)
                    scheduleDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
                    
                    // Find the latest attendance date that occurred before or on the photo creation time
                    // We normalize the attendance date to midnight in the same timezone as createdDate for comparison
                    const closestDate = scheduleDates.find(dateStr => {
                        const attDate = new Date(dateStr);
                        // Normalize attDate to midnight local time for a fair comparison with createdDate
                        return attDate.getTime() <= createdDate.getTime();
                    });

                    dateKey = closestDate || localDateStr(createdDate);
                }
                const key = `${docActivityId}_${dateKey}`;
                if (!docsMap[key]) docsMap[key] = [];
                docsMap[key].push(d.file_url);
            });
        }

        // Group data by session (Activity + Date)
        const sessionMap = {};
        rows.forEach(r => {
            const dateStr = r.att_date_str || 'no-date';
            const key = `${String(r.schedule_id)}_${dateStr}`;
            if (!sessionMap[key]) {
                sessionMap[key] = {
                    schedule_id: r.schedule_id,
                    title: r.activity_title,
                    type: r.activity_type,
                    date: r.attendance_date,
                    date_str: dateStr,
                    participants: [],
                    notes: []
                };
            }
            sessionMap[key].participants.push({
                name: r.participant_name,
                type: r.participant_type,
                status: r.status
            });
            if (r.notes) sessionMap[key].notes.push(r.notes);
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Kegiatan');

        sheet.columns = [
            { key: 'date', width: 15 },
            { key: 'peserta', width: 20 },
            { key: 'status', width: 15 },
            { key: 'notes', width: 20 },
            { key: 'photo', width: 45 }
        ];

        const imageCache = {};
        let currentRow = 1;

        // Group by Activity Title to show sections
        const activityGroups = {};
        Object.values(sessionMap).forEach(s => {
            if (!activityGroups[s.title]) activityGroups[s.title] = [];
            activityGroups[s.title].push(s);
        });

        for (const title in activityGroups) {
            // Activity Title Heading
            const titleRow = sheet.getRow(currentRow++);
            titleRow.getCell(1).value = title;
            titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF006600' } };
            
            // Table Header
            const headerRow = sheet.getRow(currentRow++);
            headerRow.values = ['Tanggal', 'Peserta', 'Status', 'Keterangan', 'Dokumentasi'];
            headerRow.height = 25;
            headerRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEE6F0' } };
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Session Rows
            activityGroups[title].forEach(session => {
                const dateVal = session.date ? new Date(session.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-';
                const participantsList = session.participants.map(p => p.name).join('\n');
                const statusList = session.participants.map(p => p.type).join('\n');
                const notesList = [...new Set(session.notes)].join('\n') || '-';

                const dataRow = sheet.getRow(currentRow++);
                dataRow.values = [dateVal, participantsList, statusList, notesList, ''];
                
                // Adjust height for content and photo
                const lineCount = Math.max(session.participants.length, 1);
                dataRow.height = Math.max(120, lineCount * 18);

                dataRow.eachCell((cell) => {
                    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                });
                // Center date cell
                dataRow.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };

                // Handle Photo
                const key = `${String(session.schedule_id)}_${session.date_str}`;
                const photos = docsMap[key] || [];

                if (photos.length > 0) {
                    const photoUrl = photos[0];
                    try {
                        let filePath = photoUrl;
                        if (!path.isAbsolute(photoUrl) && !photoUrl.startsWith('/')) {
                            filePath = '/' + photoUrl;
                        }
                        const absolutePath = path.join(__dirname, '../../', filePath);
                        
                        if (imageCache[photoUrl] === undefined) {
                            if (fs.existsSync(absolutePath)) {
                                const ext = path.extname(absolutePath).slice(1).toLowerCase() || 'png';
                                const finalExt = ext === 'jpg' ? 'jpeg' : ext;
                                const imageId = workbook.addImage({
                                    buffer: fs.readFileSync(absolutePath),
                                    extension: finalExt,
                                });
                                imageCache[photoUrl] = imageId;
                            }
                        }

                        if (imageCache[photoUrl] !== undefined) {
                            sheet.addImage(imageCache[photoUrl], {
                                tl: { col: 4, row: currentRow - 2 },
                                br: { col: 5, row: currentRow - 1 },
                                editAs: 'oneCell'
                            });
                        }
                    } catch (imgErr) {
                        console.error('Error adding image to report:', imgErr);
                    }
                }
            });

            currentRow++; // Empty row after each activity group
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_Kegiatan.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('exportActivityReport error:', err);
        res.status(500).json({ message: 'Gagal mengekspor laporan kegiatan' });
    }
};
