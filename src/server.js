const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
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
// const stayRoutes = require('./routes/stays');
// const ambulanceRoutes = require('./routes/ambulance');

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/rooms', roomRoutes);
// app.use('/api/stays', stayRoutes);
// app.use('/api/ambulance', ambulanceRoutes);

app.get('/', (req, res) => {
    res.send('API GSP YBM is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
