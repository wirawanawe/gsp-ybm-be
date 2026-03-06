const express = require('express');
const router = express.Router();
const ambulanceController = require('../controllers/ambulanceController');
const ambulanceLogController = require('../controllers/ambulanceLogController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/ambulance';
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

// Ambulance Booking / Logs (harus di atas /:id agar /logs tidak tertangkap sebagai id)
router.get('/logs', ambulanceLogController.getLogs);
router.post('/logs', upload.any(), ambulanceLogController.createLog);
router.put('/logs/:id/complete', ambulanceLogController.completeLog);

// Master Ambulance CRUD
router.get('/', ambulanceController.getAmbulances);
router.get('/:id', ambulanceController.getAmbulanceById);
router.post('/', ambulanceController.createAmbulance);
router.put('/:id', ambulanceController.updateAmbulance);
router.delete('/:id', ambulanceController.deleteAmbulance);

module.exports = router;


