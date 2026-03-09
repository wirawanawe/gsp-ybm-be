const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const roomController = require('../controllers/roomController');

router.use(authMiddleware);
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Konfigurasi upload untuk dokumen kepulangan (foto)
const departureStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(process.cwd(), 'uploads', 'departure');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const original = file.originalname || 'kepulangan';
        cb(null, Date.now() + '-' + original);
    }
});
const uploadDeparture = multer({ storage: departureStorage });

// Stay Logs routes - HARUS sebelum :id agar /check-in dan /check-out tidak tertimpa
router.post('/check-in', roomController.checkIn);
router.post('/transfer', roomController.transfer);
router.put('/check-out', uploadDeparture.single('departure_photo'), roomController.checkOut);
router.post('/stay/:stayId/visitors', roomController.addStayVisitor);

// Room routes
router.get('/', roomController.getRooms);
router.get('/:id', roomController.getRoomById);
router.post('/', roomController.createRoom);
router.put('/:id', roomController.updateRoom);
router.delete('/:id', roomController.deleteRoom);

// Bed routes
router.post('/:roomId/beds', roomController.createBed);
router.put('/beds/:bedId', roomController.updateBed);
router.delete('/beds/:bedId', roomController.deleteBed);

module.exports = router;
