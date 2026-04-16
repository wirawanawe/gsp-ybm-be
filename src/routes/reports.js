const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const reportController = require('../controllers/reportController');

router.use(authMiddleware);

// Laporan okupansi & pasien
router.get('/occupancy', reportController.getOccupancyStats);
router.get('/patient-in-out', reportController.getPatientInOut);
router.get('/patient-in-out/export', reportController.exportPatientInOut);
router.get('/ambulance-usage', reportController.getAmbulanceUsage);
router.get('/ambulance-usage/export', reportController.exportAmbulanceUsage);

// Dashboard summary
router.get('/dashboard-summary', reportController.getDashboardSummary);

module.exports = router;

