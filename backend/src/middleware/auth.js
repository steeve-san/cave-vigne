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

    const [rows] = await db.query(
      'SELECT id, email, username, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (!rows.length || !rows[0].is_active)
      return res.status(401).json({ error: 'Compte invalide ou désactivé' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// Middleware de vérification de rôle — usage: requireRole('admin') ou requireRole('user','admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Accès refusé', required: roles });
  next();
};

// Middleware auth optionnel — ne bloque pas si pas de token, mais remplit req.user si présent
const optionalAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return next();
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      'SELECT id, email, username, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (rows.length && rows[0].is_active) req.user = rows[0];
  } catch { /* ignore */ }
  next();
};

module.exports = auth;
module.exports.requireRole = requireRole;
module.exports.optionalAuth = optionalAuth;
