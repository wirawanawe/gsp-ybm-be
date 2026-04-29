const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email dan password wajib diisi' });
        }

        // Check if user exists
        const [users] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }

        const user = users[0];

        // Verify password
        const isMatched = await bcrypt.compare(password, user.password_hash);
        if (!isMatched) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }

        let accessible_menus = [];
        try {
            const [roles] = await db.query('SELECT accessible_menus FROM Roles WHERE name = ?', [user.role]);
            if (roles.length > 0) {
                const menusStr = roles[0].accessible_menus;
                accessible_menus = typeof menusStr === 'string' ? JSON.parse(menusStr) : menusStr;
            }
        } catch (e) {
            console.error('Failed fetching role menus', e);
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, role: user.role, accessible_menus },
            process.env.JWT_SECRET || 'super_secret_jwt_key_ybm',
            { expiresIn: '1d' }
        );

        res.json({
            message: 'Login berhasil',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                accessible_menus
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
};
