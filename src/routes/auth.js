const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

// Rate limit khusus login untuk mencegah brute force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 20, // maksimal 20 percobaan login / IP / window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' }
});

router.post('/login', loginLimiter, authController.login);

module.exports = router;
