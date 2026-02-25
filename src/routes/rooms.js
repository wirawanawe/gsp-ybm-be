const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

// Room routes
router.get('/', roomController.getRooms);
router.post('/', roomController.createRoom);

// Bed routes
router.post('/:roomId/beds', roomController.createBed);

// Stay Logs routes
router.post('/check-in', roomController.checkIn);
router.put('/check-out', roomController.checkOut);

module.exports = router;
