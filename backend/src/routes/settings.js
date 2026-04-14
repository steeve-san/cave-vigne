// src/routes/settings.js — System settings (admin only)
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { testConnection, sendMail } = require('../config/email');
const { cacheFlush, cacheKeys, cacheDel } = require('../config/redis');

const SENSITIVE_KEYS = ['smtp_pass', 'anthropic_key', 'openai_key', 'mistral_key',
                        'plex_token', 'ombi_key', 'tmdb_api_key'];

// GET /api/settings — list all settings
router.get('/', auth, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT setting_key, setting_value, setting_type, label, updated_at FROM system_settings ORDER BY setting_key'
    );
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

// PUT /api/settings — update settings, then flush cache + revoke all sessions
router.put('/', auth, requireRole('admin'), async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Body invalide' });
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (SENSITIVE_KEYS.includes(key) && value === '***set***') continue;
      await db.query(
        `UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?`,
        [value ?? '', req.user.id, key]
      );
      if (key === 'anthropic_key' && value && value !== '***set***') {
        process.env.ANTHROPIC_API_KEY = value;
      }
    }

    // Flush all Redis cache so stale AI-provider / stats data is cleared
    await cacheFlush();

    // Revoke ALL refresh tokens — every user must re-authenticate
    await db.query('DELETE FROM refresh_tokens');

    res.json({ message: 'Paramètres enregistrés', force_logout: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/settings/test-smtp — test SMTP connection
router.post('/test-smtp', auth, requireRole('admin'), async (req, res) => {
  try {
    await testConnection();
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
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('public_catalog')`
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.setting_key] = r.setting_value; });
    res.json(cfg);
  } catch { res.json({ public_catalog: '0' }); }
});

// ─── Cache management ─────────────────────────────────────────────────────────

const CACHE_CATEGORIES = [
  { id: 'stats',     pattern: 'stats:*',         label: 'Statistiques' },
  { id: 'enrich',   pattern: 'enrich:*',         label: 'Enrichissement vins' },
  { id: 'sommelier',pattern: 'sommelier:*',       label: 'Sommelier IA' },
  { id: 'barcode',  pattern: 'barcode:*',         label: 'Codes-barres' },
  { id: 'other',    pattern: '*',                 label: 'Tout' },
];

// GET /api/settings/cache-stats
router.get('/cache-stats', auth, requireRole('admin'), async (_req, res) => {
  try {
    const categories = [];
    let counted = new Set();

    for (const cat of CACHE_CATEGORIES.filter(c => c.id !== 'other')) {
      const keys = await cacheKeys(cat.pattern);
      keys.forEach(k => counted.add(k));
      categories.push({ ...cat, count: keys.length });
    }

    const allKeys = await cacheKeys('*');
    const otherCount = allKeys.filter(k => !counted.has(k)).length;
    categories.push({ id: 'other', pattern: '*', label: 'Autres', count: otherCount });

    res.json({ categories, total: allKeys.length });
  } catch (err) {
    res.status(500).json({ error: 'Redis non disponible', categories: [], total: 0 });
  }
});

// POST /api/settings/clear-cache — flush all or by category
router.post('/clear-cache', auth, requireRole('admin'), async (req, res) => {
  const { category = 'all' } = req.body;
  try {
    if (category === 'all') {
      await cacheFlush();
      return res.json({ message: 'Cache entièrement vidé' });
    }
    const cat = CACHE_CATEGORIES.find(c => c.id === category);
    if (!cat) return res.status(400).json({ error: 'Catégorie inconnue' });
    await cacheDel(cat.pattern);
    res.json({ message: `Cache "${cat.label}" vidé` });
  } catch (err) {
    res.status(500).json({ error: 'Redis non disponible' });
  }
});

// ─── Session management ───────────────────────────────────────────────────────

// GET /api/settings/sessions
router.get('/sessions', auth, requireRole('admin'), async (_req, res) => {
  try {
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) as total FROM refresh_tokens WHERE expires_at > NOW()'
    );
    const [perUser] = await db.query(
      `SELECT u.id, u.username, u.email, u.role,
              COUNT(t.id) as session_count,
              MAX(t.expires_at) as last_expires
       FROM refresh_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.expires_at > NOW()
       GROUP BY u.id, u.username, u.email, u.role
       ORDER BY session_count DESC`
    );
    res.json({ total, users: perUser });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/settings/sessions — revoke all sessions (all users)
router.delete('/sessions', auth, requireRole('admin'), async (_req, res) => {
  try {
    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM refresh_tokens');
    await db.query('DELETE FROM refresh_tokens');
    await cacheFlush();
    res.json({ message: `${count} session(s) révoquée(s), cache vidé`, force_logout: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/settings/sessions/:userId — revoke sessions for one user
router.delete('/sessions/:userId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { affectedRows } = await db.query(
      'DELETE FROM refresh_tokens WHERE user_id = ?', [req.params.userId]
    );
    await cacheDel(`*:${req.params.userId}:*`);
    res.json({ message: `${affectedRows} session(s) révoquée(s)` });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
