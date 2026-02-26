const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Laporan okupansi & pasien
router.get('/occupancy', reportController.getOccupancyStats);
router.get('/patient-in-out', reportController.getPatientInOut);
router.get('/ambulance-usage', reportController.getAmbulanceUsage);

module.exports = router;

