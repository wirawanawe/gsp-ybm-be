const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env variables
dotenv.config();

const app = express();

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

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const visitorRoutes = require('./routes/visitors');
const reportRoutes = require('./routes/reports');
// const stayRoutes = require('./routes/stays');

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/reports', reportRoutes);
// app.use('/api/stays', stayRoutes);

app.get('/', (req, res) => {
    res.send('API GSP YBM is running...');
});

const PORT = process.env.PORT || 3331;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
