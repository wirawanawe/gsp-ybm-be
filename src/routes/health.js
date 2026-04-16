const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const ctrl = require('../controllers/healthController');

router.use(authMiddleware);

// Patient search
router.get('/patients-search', ctrl.searchPatients);

// Vitals (tensi)
router.get('/vitals', ctrl.getVitals);
router.post('/vitals', ctrl.createVital);
router.put('/vitals/:id', ctrl.updateVital);
router.delete('/vitals/:id', ctrl.deleteVital);

// Conditions (catatan kondisi)
router.get('/conditions', ctrl.getConditions);
router.post('/conditions', ctrl.createCondition);
router.put('/conditions/:id', ctrl.updateCondition);
router.delete('/conditions/:id', ctrl.deleteCondition);

module.exports = router;
