// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token manquant' });

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await db.query('SELECT id, email, username, role, is_active FROM users WHERE id = ?', [decoded.userId]);
    if (!rows.length || !rows[0].is_active)
      return res.status(401).json({ error: 'Compte invalide ou désactivé' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Token invalide' });
  }
};

module.exports = auth;
