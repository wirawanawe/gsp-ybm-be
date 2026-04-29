const express = require('express');
const router = express.Router();
const heroSliderController = require('../controllers/heroSliderController');
const authMiddleware = require('../config/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'hero-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Format file tidak didukung'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Public route for landing page
router.get('/public', heroSliderController.getPublicSliders);

// Protected routes
router.use(authMiddleware);
router.get('/', heroSliderController.getAllSliders);
router.post('/', upload.single('image'), heroSliderController.createSlider);
router.put('/:id', upload.single('image'), heroSliderController.updateSlider);
router.delete('/:id', heroSliderController.deleteSlider);

module.exports = router;
