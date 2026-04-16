const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const ctrl = require('../controllers/activityController');

router.use(authMiddleware);

// Schedules
router.get('/', ctrl.getSchedules);
router.post('/', ctrl.createSchedule);
router.put('/:id', ctrl.updateSchedule);
router.delete('/:id', ctrl.deleteSchedule);

// Attendance & Summary
router.get('/attendance/summary', ctrl.getAttendanceSummary);
router.get('/upcoming', ctrl.getUpcomingSchedules);
router.get('/:id/attendance', ctrl.getAttendance);
router.post('/:id/attendance', ctrl.createAttendance);
router.put('/:id/attendance/:attendId', ctrl.updateAttendance);
router.delete('/:id/attendance/:attendId', ctrl.deleteAttendance);

module.exports = router;
