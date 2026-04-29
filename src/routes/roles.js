const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const authMiddleware = require('../config/authMiddleware');

router.use(authMiddleware);
router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'Admin YBM') {
        return res.status(403).json({ message: 'Akses ditolak' });
    }
    next();
});

router.get('/', roleController.getRoles);
router.get('/:id', roleController.getRoleById);
router.post('/', roleController.createRole);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

module.exports = router;
