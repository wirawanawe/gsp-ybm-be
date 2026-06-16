const fs = require('fs');
const file = '/Users/wirawanawe/Project/PHC/gsp-ybm/gsp-ybm-be/src/controllers/reportController.js';
let content = fs.readFileSync(file, 'utf8');

// Replace exports.getDashboardSummary function
const newFunc = `exports.getDashboardSummary = async (req, res) => {
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
            \`SELECT p.gender, COUNT(DISTINCT s.patient_id) as count
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             WHERE s.final_status IS NULL\${dateConditionS}
             GROUP BY p.gender\`,
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
            \`SELECT p.gender, COUNT(DISTINCT s.patient_id) as count
             FROM StayLogs s
             JOIN Patients p ON p.id = s.patient_id
             WHERE s.final_status IS NOT NULL\${dateConditionS}
             GROUP BY p.gender\`,
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
            \`SELECT COUNT(*) AS total_patients FROM Patients WHERE 1=1\${dateConditionP}\`,
            [...paramsP]
        );
        // Pasien pending verifikasi
        const [[{ pending_patients }]] = await db.query(
            \`SELECT COUNT(*) AS pending_patients FROM PatientRegistrations WHERE status_verification = 'Pending'\${dateConditionPR}\`,
            [...paramsPR]
        );

        // Distribusi Jenis Kelamin
        const [genderRows] = await db.query(
            \`SELECT gender, COUNT(*) AS count FROM Patients WHERE 1=1\${dateConditionP} GROUP BY gender\`,
            [...paramsP]
        );
        const gender_distribution = { 'Laki-laki': 0, 'Perempuan': 0 };
        for (const row of genderRows) {
            if (row.gender === 'Laki-laki' || row.gender === 'Laki-Laki') gender_distribution['Laki-laki'] += Number(row.count);
            if (row.gender === 'Perempuan') gender_distribution['Perempuan'] += Number(row.count);
        }

        // Kategori Penyakit
        const [diseaseRows] = await db.query(
            \`SELECT disease_category, COUNT(*) AS count FROM Patients WHERE disease_category IS NOT NULL AND disease_category != ''\${dateConditionP} GROUP BY disease_category ORDER BY count DESC\`,
            [...paramsP]
        );
        const disease_categories = diseaseRows.map(row => ({ category: row.disease_category, count: Number(row.count) }));

        // Asal Kota (Kabupaten)
        const [cityRows] = await db.query(
            \`SELECT kabupaten, COUNT(*) AS count FROM Patients WHERE kabupaten IS NOT NULL AND kabupaten != ''\${dateConditionP} GROUP BY kabupaten ORDER BY count DESC\`,
            [...paramsP]
        );
        const patient_cities = cityRows.map(row => ({ city: row.kabupaten, count: Number(row.count) }));

        // Golongan Usia
        const [ageRows] = await db.query(
            \`SELECT age_category, COUNT(*) AS count FROM Patients WHERE age_category IS NOT NULL AND age_category != ''\${dateConditionP} GROUP BY age_category ORDER BY count DESC\`,
            [...paramsP]
        );
        const age_categories = ageRows.map(row => ({ category: row.age_category, count: Number(row.count) }));

        // Tingkat Pendidikan
        const [eduRows] = await db.query(
            \`SELECT education, COUNT(*) AS count FROM Patients WHERE education IS NOT NULL AND education != ''\${dateConditionP} GROUP BY education ORDER BY count DESC\`,
            [...paramsP]
        );
        const educations = eduRows.map(row => ({ level: row.education, count: Number(row.count) }));

        // Pekerjaan (Jenis Pendidikan/Pekerjaan)
        const [occRows] = await db.query(
            \`SELECT occupation, COUNT(*) AS count FROM Patients WHERE occupation IS NOT NULL AND occupation != ''\${dateConditionP} GROUP BY occupation ORDER BY count DESC\`,
            [...paramsP]
        );
        const occupations = occRows.map(row => ({ type: row.occupation, count: Number(row.count) }));`;

const startIdx = content.indexOf('exports.getDashboardSummary = async (req, res) => {');
const endIdx = content.indexOf('        // Kamar: total beds & yang tersedia', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + newFunc + '\n' + content.substring(endIdx);
    fs.writeFileSync(file, content);
    console.log('Patched reportController.js successfully');
} else {
    console.log('Failed to find replace boundaries');
}
