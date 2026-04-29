const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load env variables
dotenv.config();

const app = express();

// Di belakang reverse proxy (Nginx, PM2, dll.) agar express-rate-limit mengenali IP asli dari X-Forwarded-For
app.set('trust proxy', 1);

// CORS - izinkan localhost:3000 dan FRONTEND_URL (mis. http://192.168.18.49:3000)
const allowedOrigins = ['http://localhost:3330'];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL.trim());
const corsOptions = {
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // supaya file uploads tetap bisa diakses FE
}));

// Global rate limiter untuk semua endpoint API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 1000, // maksimal 1000 request / IP / window
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);

// Static folder for uploads
app.use('/uploads', express.static('uploads'));

// Test DB Connection
const db = require('./config/db');
db.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed: ', err.message);
    });

// Routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const roomRoutes = require('./routes/rooms');
const ambulanceRoutes = require('./routes/ambulance');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const visitorRoutes = require('./routes/visitors');
const reportRoutes = require('./routes/reports');
const activityRoutes = require('./routes/activities');
const healthRoutes = require('./routes/health');
const financeRoutes = require('./routes/finance');
const documentationRoutes = require('./routes/documentation');
const heroSliderRoutes = require('./routes/heroSliders');


// const stayRoutes = require('./routes/stays');

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/documentation', documentationRoutes);
app.use('/api/hero-sliders', heroSliderRoutes);


// app.use('/api/stays', stayRoutes);

app.get('/', (req, res) => {
    res.send('API GSP YBM is running...');
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack || err);
    res.status(err.status || 500).json({
        message: err.message || 'Terjadi kesalahan sistem',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

const PORT = process.env.PORT || 3331;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
