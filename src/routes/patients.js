const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configure Multer for KTP/KK Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const fieldMap = {
            ktp: 'uploads/ktp',
            kk: 'uploads/kk',
            bpjs: 'uploads/bpjs',
            sktm: 'uploads/sktm',
            rujukan: 'uploads/rujukan'
        };

        // Auto-create folder if doesn't exist
        const dir = fieldMap[file.fieldname] || 'uploads/misc';
        const uploadPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.get('/', patientController.getPatients);
router.get('/applicants', patientController.getApplicants);
router.get('/pending-count', patientController.getPendingCount);
router.get('/by-nik', patientController.getPatientByNik);
router.get('/:id/documents', patientController.getPatientDocuments);
router.post('/:id/documents', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 },
    { name: 'bpjs', maxCount: 1 },
    { name: 'sktm', maxCount: 1 },
    { name: 'rujukan', maxCount: 1 }
]), patientController.addPatientDocuments);

router.post('/register', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 },
    { name: 'bpjs', maxCount: 1 },
    { name: 'sktm', maxCount: 1 },
    { name: 'rujukan', maxCount: 1 }
]), patientController.registerPatient);

router.put('/:id/verify', patientController.verifyPatient);
router.post('/:id/re-register', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 },
    { name: 'bpjs', maxCount: 1 },
    { name: 'sktm', maxCount: 1 },
    { name: 'rujukan', maxCount: 1 }
]), patientController.reRegister);

module.exports = router;
