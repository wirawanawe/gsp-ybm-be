const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const ctrl = require('../controllers/financeController');

router.use(authMiddleware);

// Income
router.get('/income', ctrl.getIncome);
router.post('/income', ctrl.createIncome);
router.put('/income/:id', ctrl.updateIncome);
router.delete('/income/:id', ctrl.deleteIncome);

// Expenses
router.get('/expenses', ctrl.getExpenses);
router.post('/expenses', ctrl.createExpense);
router.put('/expenses/:id', ctrl.updateExpense);
router.delete('/expenses/:id', ctrl.deleteExpense);

// Reports
router.get('/report', ctrl.getReport);
router.get('/rekap', ctrl.getRekap);

module.exports = router;
