// src/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const auth = require('../middleware/auth');

const genTokens = (userId) => {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  return { access, refresh };
};

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('username').trim().isLength({ min: 2, max: 50 }),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, username, password } = req.body;
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)',
      [email, username, hash]
    );
    const tokens = genTokens(result.insertId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [result.insertId, tokens.refresh, expiresAt]);

    res.status(201).json({ user: { id: result.insertId, email, username }, ...tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Identifiants invalides' });

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Compte désactivé' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });

    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    const tokens = genTokens(user.id);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, tokens.refresh, expiresAt]);

    res.json({ user: { id: user.id, email: user.email, username: user.username, avatar_url: user.avatar_url, role: user.role }, ...tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh } = req.body;
  if (!refresh) return res.status(400).json({ error: 'Refresh token manquant' });
  try {
    const decoded = jwt.verify(refresh, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Token invalide' });

    const [rows] = await db.query('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()', [refresh]);
    if (!rows.length) return res.status(401).json({ error: 'Token expiré ou révoqué' });

    await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh]);
    const tokens = genTokens(decoded.userId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [decoded.userId, tokens.refresh, expiresAt]);

    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// POST /api/auth/logout
router.post('/logout', auth, async (req, res) => {
  const { refresh } = req.body;
  if (refresh) await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh]);
  res.json({ message: 'Déconnecté' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
