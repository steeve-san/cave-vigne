// src/routes/settings.js — System settings (admin only)
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { testConnection, sendMail } = require('../config/email');

const SENSITIVE_KEYS = ['smtp_pass', 'anthropic_key'];

// GET /api/settings — list all settings
router.get('/', auth, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT setting_key, setting_value, setting_type, label, updated_at FROM system_settings ORDER BY setting_key'
    );
    // Mask sensitive values in the response
    const settings = rows.map(r => ({
      ...r,
      setting_value: SENSITIVE_KEYS.includes(r.setting_key) && r.setting_value
        ? '***set***'
        : r.setting_value,
      is_set: SENSITIVE_KEYS.includes(r.setting_key) ? !!r.setting_value : undefined,
    }));
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/settings — update one or more settings
router.put('/', auth, requireRole('admin'), async (req, res) => {
  const updates = req.body; // { key: value, ... }
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Body invalide' });
  try {
    for (const [key, value] of Object.entries(updates)) {
      // Skip overwriting a sensitive key if the value is the placeholder
      if (SENSITIVE_KEYS.includes(key) && value === '***set***') continue;
      await db.query(
        `UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?`,
        [value ?? '', req.user.id, key]
      );
      // If the Anthropic key is updated, also update the env var for the current session
      if (key === 'anthropic_key' && value && value !== '***set***') {
        process.env.ANTHROPIC_API_KEY = value;
      }
    }
    res.json({ message: 'Paramètres enregistrés' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/settings/test-smtp — test SMTP connection
router.post('/test-smtp', auth, requireRole('admin'), async (req, res) => {
  try {
    await testConnection();
    // Send a test email to the admin
    await sendMail({
      to: req.user.email,
      subject: 'Cave & Vigne — Test SMTP',
      html: `<p>Configuration SMTP opérationnelle.</p><p><small>Envoyé depuis Cave & Vigne</small></p>`,
    });
    res.json({ message: `Email de test envoyé à ${req.user.email}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/settings/public — public settings (no auth required)
router.get('/public', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT setting_key, setting_value FROM system_settings
       WHERE setting_key IN ('public_catalog')`,
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
    res.json(cfg);
  } catch { res.json({ public_catalog: '0' }); }
});

module.exports = router;
