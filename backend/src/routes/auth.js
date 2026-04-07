// src/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const genTokens = (userId) => {
  const access  = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  return { access, refresh };
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
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
      "INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, 'user')",
      [email, username, hash]
    );
    const tokens = genTokens(result.insertId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [result.insertId, tokens.refresh, expiresAt]);

    res.status(201).json({
      user: { id: result.insertId, email, username, role: 'user' },
      ...tokens
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
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

    // Verify 2FA TOTP if enabled
    if (user.totp_enabled) {
      const { totp_code } = req.body;
      if (!totp_code) return res.status(200).json({ requires_totp: true });
      const ok = speakeasy.totp.verify({
        secret: user.totp_secret, encoding: 'base32',
        token: totp_code, window: 1,
      });
      if (!ok) return res.status(401).json({ error: 'Code 2FA invalide' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    const tokens = genTokens(user.id);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, tokens.refresh, expiresAt]);

    res.json({
      user: { id: user.id, email: user.email, username: user.username, avatar_url: user.avatar_url, role: user.role, totp_enabled: !!user.totp_enabled },
      ...tokens
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh } = req.body;
  if (!refresh) return res.status(400).json({ error: 'Refresh token manquant' });
  try {
    const decoded = jwt.verify(refresh, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Token invalide' });

    const [rows] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()', [refresh]);
    if (!rows.length) return res.status(401).json({ error: 'Token expiré ou révoqué' });

    await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh]);
    const tokens = genTokens(decoded.userId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [decoded.userId, tokens.refresh, expiresAt]);

    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  const { refresh } = req.body;
  if (refresh) await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh]);
  res.json({ message: 'Déconnecté' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// ─── 2FA TOTP ─────────────────────────────────────────────────────────────────
// POST /api/auth/totp/setup — generate a secret + QR code
router.post('/totp/setup', auth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `Cave & Vigne (${req.user.email})`, length: 20 });
    // Temporarily store the secret (not yet activated)
    await db.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, req.user.id]);
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qr_code: qr, otpauth_url: secret.otpauth_url });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/totp/confirm — confirm TOTP code and activate 2FA
router.post('/totp/confirm', auth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Code requis' });
  try {
    const [rows] = await db.query('SELECT totp_secret FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]?.totp_secret) return res.status(400).json({ error: 'Setup 2FA non initialisé' });
    const ok = speakeasy.totp.verify({ secret: rows[0].totp_secret, encoding: 'base32', token, window: 1 });
    if (!ok) return res.status(400).json({ error: 'Code invalide — réessayez' });
    await db.query('UPDATE users SET totp_enabled = TRUE WHERE id = ?', [req.user.id]);
    res.json({ message: '2FA activé avec succès' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/totp/disable — disable 2FA
router.post('/totp/disable', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Mot de passe requis' });
  try {
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect' });
    await db.query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [req.user.id]);
    res.json({ message: '2FA désactivé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/auth/totp/status
router.get('/totp/status', auth, async (req, res) => {
  const [rows] = await db.query('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
  res.json({ totp_enabled: !!rows[0]?.totp_enabled });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — User management (admin role only)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/auth/admin/users — list all users
router.get('/admin/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, email, username, role, is_active, avatar_url, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/admin/users — create a user
router.post('/admin/users', auth, requireRole('admin'), [
  body('email').isEmail().normalizeEmail(),
  body('username').trim().isLength({ min: 2, max: 50 }),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['visiteur', 'user', 'admin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, username, password, role } = req.body;
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (email, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [email, username, hash, role]
    );
    res.status(201).json({ id: result.insertId, email, username, role, is_active: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/auth/admin/users/:id — update role / status
router.put('/admin/users/:id', auth, requireRole('admin'), async (req, res) => {
  const { role, is_active } = req.body;
  const { id } = req.params;

  // Prevent self-demotion
  if (parseInt(id) === req.user.id && role && role !== 'admin')
    return res.status(400).json({ error: 'Impossible de modifier votre propre rôle' });

  try {
    const updates = []; const params = [];
    if (role !== undefined && ['visiteur','user','admin'].includes(role)) {
      updates.push('role = ?'); params.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?'); params.push(is_active ? 1 : 0);
    }
    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });

    params.push(id);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await db.query(
      'SELECT id, email, username, role, is_active, created_at, last_login FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/auth/admin/users/:id — deactivate (soft delete)
router.delete('/admin/users/:id', auth, requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  try {
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur désactivé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
