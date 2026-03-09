const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const userController = require('../controllers/userController');

router.use(authMiddleware);

// Master Users CRUD
router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;

