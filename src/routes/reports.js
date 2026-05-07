const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const reportController = require('../controllers/reportController');
const activityController = require('../controllers/activityController');

router.use(authMiddleware);

// Laporan okupansi & pasien
router.get('/occupancy', reportController.getOccupancyStats);
router.get('/patient-in-out', reportController.getPatientInOut);
router.get('/patient-in-out/export', reportController.exportPatientInOut);
router.get('/ambulance-usage', reportController.getAmbulanceUsage);
router.get('/ambulance-usage/export', reportController.exportAmbulanceUsage);

// Dashboard summary
router.get('/dashboard-summary', reportController.getDashboardSummary);

// Laporan kegiatan
router.get('/activity', activityController.getActivityReport);
router.get('/activity/export', activityController.exportActivityReport);

module.exports = router;

