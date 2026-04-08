// src/routes/sharing.js — shared cave management
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// GET /api/sharing — list invitations I sent + caves shared with me
router.get('/', auth, async (req, res) => {
  try {
    const [asOwner] = await db.query(
      `SELECT sc.id, sc.invite_email, sc.permission, sc.accepted, sc.accepted_at, sc.created_at,
              u.username as guest_username, u.avatar_url as guest_avatar
       FROM shared_caves sc
       LEFT JOIN users u ON u.id = sc.guest_id
       WHERE sc.owner_id = ? ORDER BY sc.created_at DESC`,
      [req.user.id]
    );
    const [asGuest] = await db.query(
      `SELECT sc.id, sc.permission, sc.accepted_at, sc.created_at,
              u.username as owner_username, u.avatar_url as owner_avatar, sc.owner_id
       FROM shared_caves sc
       JOIN users u ON u.id = sc.owner_id
       WHERE sc.guest_id = ? AND sc.accepted = 1 ORDER BY sc.created_at DESC`,
      [req.user.id]
    );
    res.json({ as_owner: asOwner, as_guest: asGuest });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/sharing/invite — send an invitation by email
router.post('/invite', auth, requireRole('user', 'admin'), async (req, res) => {
  const { email, permission = 'read' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  if (!['read', 'write'].includes(permission)) return res.status(400).json({ error: 'Permission invalide' });

  // Cannot invite yourself
  if (email.toLowerCase() === req.user.email?.toLowerCase())
    return res.status(400).json({ error: 'Vous ne pouvez pas partager votre cave avec vous-même' });

  // Avoid duplicate pending invite
  const [existing] = await db.query(
    'SELECT id FROM shared_caves WHERE owner_id=? AND invite_email=? AND accepted=0',
    [req.user.id, email.toLowerCase()]
  );
  if (existing.length) return res.status(409).json({ error: 'Une invitation en attente existe déjà pour cet email' });

  try {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO shared_caves (owner_id, invite_email, token, permission) VALUES (?,?,?,?)`,
      [req.user.id, email.toLowerCase(), token, permission]
    );
    res.json({ success: true, token, message: `Invitation créée. Partagez ce lien : /sharing/accept/${token}` });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/sharing/accept/:token — accept an invitation (must be logged in)
router.get('/accept/:token', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM shared_caves WHERE token=?', [req.params.token]);
  if (!rows.length) return res.status(404).json({ error: 'Invitation introuvable ou expirée' });
  const invite = rows[0];
  if (invite.accepted) return res.status(409).json({ error: 'Invitation déjà acceptée' });
  if (invite.owner_id === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas accepter votre propre invitation' });
  try {
    await db.query(
      'UPDATE shared_caves SET guest_id=?, accepted=1, accepted_at=NOW() WHERE id=?',
      [req.user.id, invite.id]
    );
    // Fetch owner info
    const [[owner]] = await db.query('SELECT username FROM users WHERE id=?', [invite.owner_id]);
    res.json({ success: true, owner_id: invite.owner_id, owner_username: owner?.username });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/sharing/:id — revoke (owner removes access, or guest leaves)
router.delete('/:id', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM shared_caves WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Partage introuvable' });
  const share = rows[0];
  if (share.owner_id !== req.user.id && share.guest_id !== req.user.id)
    return res.status(403).json({ error: 'Accès interdit' });
  await db.query('DELETE FROM shared_caves WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// GET /api/sharing/cave/:ownerId — browse a shared cave (read-only)
router.get('/cave/:ownerId', auth, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!ownerId) return res.status(400).json({ error: 'ID invalide' });
  try {
    // Verify access
    const [access] = await db.query(
      'SELECT * FROM shared_caves WHERE owner_id=? AND guest_id=? AND accepted=1',
      [ownerId, req.user.id]
    );
    if (!access.length) return res.status(403).json({ error: 'Accès non autorisé' });

    const [wines] = await db.query(
      `SELECT id, name, type, vintage, appellation, region, country, grapes,
              quantity, price, keep_until, notes, label_image, is_drunk
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 ORDER BY name`,
      [ownerId]
    );
    const [[owner]] = await db.query('SELECT username, avatar_url FROM users WHERE id=?', [ownerId]);
    const [[stats]] = await db.query(
      `SELECT COUNT(*) as refs, SUM(quantity) as bottles,
              SUM(COALESCE(price*quantity,0)) as value
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0`,
      [ownerId]
    );
    res.json({ wines, owner, stats });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
