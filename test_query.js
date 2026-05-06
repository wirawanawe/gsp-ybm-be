const db = require('./src/config/db');
async function test() {
    try {
        const [rows] = await db.query(`
            SELECT 
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
        `);
        console.log("Rows count:", rows.length);
        if (rows.length > 0) {
            console.log("First row disease_category:", rows[0].disease_category);
            console.log("Row keys:", Object.keys(rows[0]));
        }
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
test();
