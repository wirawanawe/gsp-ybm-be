const fs = require('fs');
const filePath = '/Users/wirawanawe/Project/PHC/gsp-ybm/gsp-ybm-be/src/controllers/reportController.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add fields to SELECT
content = content.replace(
    /p\.age_category, p\.education, p\.disease_category,/g,
    'p.age_category, p.education, p.disease_category, p.treatment_plan, p.rs_rujukan,'
);

// 2. Modify sheet.columns
const newCols = `            // PASIEN (20 cols: 1-20 / A-T)
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

            // PENDAMPING 1 (15 cols: 21-35 / U-AI)
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

            // FASILITAS (2 cols: 58-59)
            { header: 'Nomor Kamar', key: 'f_kamar', width: 15 },
            { header: 'Nomor Bed', key: 'f_bed', width: 15 }`;
            
const oldColsRegex = /\/\/ PASIEN \(20 cols: 1-20 \/ A-T\)[\s\S]+?\{ header: 'Nomor Bed', key: 'f_bed', width: 15 \}/;
content = content.replace(oldColsRegex, newCols);

// 3. Update merged cells for FASILITAS
content = content.replace(/sheet\.mergeCells\(1, 58, 1, 61\);/g, 'sheet.mergeCells(1, 58, 1, 59);');

// 4. Update data mapping
const newDataMapping = `            const pData = {
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
                
                rs_id: \`RS-\${row.id.toString().padStart(4, '0')}\`,
                rs_asal: row.rs_rujukan || '-',
                rs_masuk: row.check_in_date ? new Date(row.check_in_date) : null,
                rs_keluar: row.check_out_date ? new Date(row.check_out_date) : null,
                rs_lama: calculateDays(row.check_in_date, row.check_out_date),
                rs_status: row.final_status || 'Masih dirawat',
                rs_ket: '-',

                f_kamar: row.room_number || '-',
                f_bed: row.bed_number || '-'
            };`;

const oldDataMappingRegex = /const pData = {[\s\S]+?f_bed: row\.bed_number \|\| '-'\s*};/;
content = content.replace(oldDataMappingRegex, newDataMapping);

fs.writeFileSync(filePath, content, 'utf8');
console.log('reportController.js updated successfully');
