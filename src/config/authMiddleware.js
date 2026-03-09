const jwt = require('jsonwebtoken');

/**
 * Auth middleware — decode JWT dari header Authorization.
 * Jika valid, set req.user = { id, role }.
 * Jika tidak ada token / invalid, req.user = null (tidak reject — opsional).
 */
module.exports = (req, res, next) => {
    req.user = null;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_ybm');
        req.user = { id: decoded.id, role: decoded.role };
    } catch (err) {
        // Token invalid / expired — lanjut tanpa user
    }

    next();
};
