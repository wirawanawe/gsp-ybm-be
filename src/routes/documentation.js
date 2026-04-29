const express = require('express');
const router = express.Router();
const documentationController = require('../controllers/documentationController');
const authMiddleware = require('../config/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/mpeg', 'video/quicktime'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Format file tidak didukung (hanya JPG, PNG, WEBP, dan MP4)'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// All routes are protected
router.use(authMiddleware);

router.get('/', documentationController.getDocumentation);
router.post('/', upload.single('file'), documentationController.createDocumentation);
router.put('/:id', documentationController.updateDocumentation);
router.delete('/:id', documentationController.deleteDocumentation);

module.exports = router;
