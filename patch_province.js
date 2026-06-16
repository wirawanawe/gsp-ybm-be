const fs = require('fs');
const file = '/Users/wirawanawe/Project/PHC/gsp-ybm/gsp-ybm-be/src/controllers/reportController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /\/\/ Asal Kota \(Kabupaten\)([\s\S]*?)const patient_cities = cityRows\.map\(row => \(\{ city: row\.kabupaten, count: Number\(row\.count\) \}\)\);/,
    `// Asal Wilayah (Provinsi)
        const [provinsiRows] = await db.query(
            \`SELECT provinsi, COUNT(*) AS count FROM Patients WHERE provinsi IS NOT NULL AND provinsi != ''\${dateConditionP} GROUP BY provinsi ORDER BY count DESC\`,
            [...paramsP]
        );
        const patient_provinces = provinsiRows.map(row => ({ province: row.provinsi, count: Number(row.count) }));`
);

content = content.replace(
    /cities: patient_cities,/,
    `provinces: patient_provinces,`
);

fs.writeFileSync(file, content);
console.log('Patched reportController.js successfully for province');
