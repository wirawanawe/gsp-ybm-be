const express = require('express');
const router = express.Router();
const authMiddleware = require('../config/authMiddleware');
const visitorController = require('../controllers/visitorController');

router.use(authMiddleware);
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
// KTP/KK opsional - untuk registrasi sederhana penunggu (hanya NIK, Nama, No HP, Hubungan)
router.post('/', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 }
]), visitorController.createVisitor);
router.put('/:id', upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 }
]), visitorController.updateVisitor);
router.delete('/:id', visitorController.deleteVisitor);

module.exports = router;
