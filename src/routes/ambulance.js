const express = require('express');
const router = express.Router();
const ambulanceController = require('../controllers/ambulanceController');
const ambulanceLogController = require('../controllers/ambulanceLogController');

// Ambulance Booking / Logs (harus di atas /:id agar /logs tidak tertangkap sebagai id)
router.get('/logs', ambulanceLogController.getLogs);
router.post('/logs', ambulanceLogController.createLog);
router.put('/logs/:id/complete', ambulanceLogController.completeLog);

// Master Ambulance CRUD
router.get('/', ambulanceController.getAmbulances);
router.get('/:id', ambulanceController.getAmbulanceById);
router.post('/', ambulanceController.createAmbulance);
router.put('/:id', ambulanceController.updateAmbulance);
router.delete('/:id', ambulanceController.deleteAmbulance);

module.exports = router;


