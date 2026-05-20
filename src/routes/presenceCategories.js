const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const presenceCategoryController = require('../controllers/presenceCategoryController');

router.use(authMiddleware);

// Get all presence categories
router.get('/', presenceCategoryController.getPresenceCategories);

// Create a new presence category
router.post('/', presenceCategoryController.createPresenceCategory);

// Update a presence category
router.put('/:id', presenceCategoryController.updatePresenceCategory);

// Delete a presence category
router.delete('/:id', presenceCategoryController.deletePresenceCategory);

module.exports = router;
