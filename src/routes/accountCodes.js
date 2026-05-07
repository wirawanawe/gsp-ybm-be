const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const ctrl = require('../controllers/accountCodeController');

router.use(authMiddleware);

router.get('/', ctrl.getAccountCodes);
router.post('/', ctrl.createAccountCode);
router.put('/:id', ctrl.updateAccountCode);
router.delete('/:id', ctrl.deleteAccountCode);

module.exports = router;
