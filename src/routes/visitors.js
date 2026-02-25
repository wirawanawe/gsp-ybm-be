const express = require('express');
const router = express.Router();
const visitorController = require('../controllers/visitorController');
const multer = require('multer');

// Configure Multer for KTP/KK Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'ktp') {
            cb(null, 'uploads/ktp/');
        } else if (file.fieldname === 'kk') {
            cb(null, 'uploads/kk/');
        } else {
            cb(null, 'uploads/misc/');
        }
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.get('/', visitorController.getVisitors);
router.post('/', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 }
]), visitorController.createVisitor);

module.exports = router;
