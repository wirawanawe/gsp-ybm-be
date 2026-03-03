const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

// Stay Logs routes - HARUS sebelum :id agar /check-in dan /check-out tidak tertimpa
router.post('/check-in', roomController.checkIn);
router.post('/transfer', roomController.transfer);
router.put('/check-out', roomController.checkOut);

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
