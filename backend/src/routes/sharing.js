// src/routes/sharing.js — shared cave management (read + collaborative write)
const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const multer = require('multer');
const sharp = require('sharp');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});
const uploadFields = upload.fields([{ name: 'label', maxCount: 1 }, { name: 'bottle_photo', maxCount: 1 }]);

async function saveImage(buffer, prefix, userId) {
  const dir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${prefix}_${userId}_${Date.now()}.webp`;
  await sharp(buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, filename));
  return `/uploads/${filename}`;
}

// ── Helper: verify guest has at minimum 'read' access ────────────────────────
async function getShareAccess(guestId, ownerId) {
  const [rows] = await db.query(
    'SELECT permission FROM shared_caves WHERE owner_id=? AND guest_id=? AND accepted=1',
    [ownerId, guestId]
  );
  return rows[0] || null; // { permission: 'read'|'write' } or null
}

// ── Helper: verify guest has 'write' access ───────────────────────────────────
async function requireWriteAccess(guestId, ownerId, res) {
  const share = await getShareAccess(guestId, ownerId);
  if (!share) { res.status(403).json({ error: 'Accès non autorisé' }); return null; }
  if (share.permission !== 'write') { res.status(403).json({ error: 'Accès en écriture requis' }); return null; }
  return share;
}

// ─────────────────────────────────────────────────────────────────────────────
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

// POST /api/sharing/invite — send an invitation (permission: 'read' | 'write')
router.post('/invite', auth, requireRole('user', 'admin'), async (req, res) => {
  const { email, permission = 'read' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  if (!['read', 'write'].includes(permission)) return res.status(400).json({ error: 'Permission invalide' });
  if (email.toLowerCase() === req.user.email?.toLowerCase())
    return res.status(400).json({ error: 'Vous ne pouvez pas partager votre cave avec vous-même' });

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
    res.json({ success: true, token, permission, message: `Invitation créée. Partagez ce lien : /sharing/accept/${token}` });
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
    const [[owner]] = await db.query('SELECT username FROM users WHERE id=?', [invite.owner_id]);
    res.json({ success: true, owner_id: invite.owner_id, owner_username: owner?.username, permission: invite.permission });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/sharing/:id/permission — owner upgrades/downgrades guest permission
router.put('/:id/permission', auth, async (req, res) => {
  const { permission } = req.body;
  if (!['read', 'write'].includes(permission)) return res.status(400).json({ error: 'Permission invalide' });
  const [rows] = await db.query('SELECT * FROM shared_caves WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Partage introuvable' });
  if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Seul le propriétaire peut modifier les permissions' });
  await db.query('UPDATE shared_caves SET permission=? WHERE id=?', [permission, req.params.id]);
  res.json({ success: true, permission });
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

// GET /api/sharing/cave/:ownerId — browse a shared cave (returns permission level)
router.get('/cave/:ownerId', auth, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!ownerId) return res.status(400).json({ error: 'ID invalide' });
  try {
    const share = await getShareAccess(req.user.id, ownerId);
    if (!share) return res.status(403).json({ error: 'Accès non autorisé' });

    const [wines] = await db.query(
      `SELECT id, name, type, vintage, appellation, region, country, grapes,
              quantity, price, keep_until, notes, label_image, is_drunk, position, producer
       FROM wines WHERE user_id=? ORDER BY is_drunk ASC, name ASC`,
      [ownerId]
    );
    const [[owner]] = await db.query('SELECT username, avatar_url FROM users WHERE id=?', [ownerId]);
    const [[stats]] = await db.query(
      `SELECT COUNT(*) as refs, SUM(quantity) as bottles,
              SUM(COALESCE(price*quantity,0)) as value
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0`,
      [ownerId]
    );
    res.json({ wines, owner, stats, permission: share.permission });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Write operations (permission='write' required) ───────────────────────────

// POST /api/sharing/cave/:ownerId/wines — add a wine to owner's cave
router.post('/cave/:ownerId/wines', auth, uploadFields, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!await requireWriteAccess(req.user.id, ownerId, res)) return;

  const { name, appellation, vintage, type, producer, region, grapes, country,
          quantity, position, price, keep_until, notes,
          domain_website, domain_description, soil_type, altitude } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });

  try {
    const labelFile  = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    const labelUrl  = labelFile  ? await saveImage(labelFile.buffer,  'label',  ownerId) : null;
    const bottleUrl = bottleFile ? await saveImage(bottleFile.buffer, 'bottle', ownerId) : null;

    const [result] = await db.query(
      `INSERT INTO wines (user_id,name,appellation,vintage,type,producer,region,grapes,country,
                          quantity,position,price,keep_until,notes,label_image,bottle_photo,
                          domain_website,domain_description,soil_type,altitude)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ownerId, name, appellation||null, vintage||null, type, producer||null, region||null,
       grapes||null, country||'France', quantity||1, position||null, price||null,
       keep_until||null, notes||null, labelUrl, bottleUrl,
       domain_website||null, domain_description||null, soil_type||null, altitude||null]
    );
    const [rows] = await db.query('SELECT * FROM wines WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/sharing/cave/:ownerId/wines/:id — edit a wine in owner's cave
router.put('/cave/:ownerId/wines/:id', auth, uploadFields, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!await requireWriteAccess(req.user.id, ownerId, res)) return;

  try {
    const [rows] = await db.query('SELECT id FROM wines WHERE id=? AND user_id=?', [req.params.id, ownerId]);
    if (!rows.length) return res.status(404).json({ error: 'Vin introuvable' });

    const fields = ['name','appellation','vintage','type','producer','region','grapes','country',
                    'quantity','position','price','keep_until','notes','is_drunk',
                    'domain_website','domain_description','soil_type','altitude'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });

    const labelFile  = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    if (labelFile)  { updates.push('label_image = ?');  params.push(await saveImage(labelFile.buffer,  'label',  ownerId)); }
    if (bottleFile) { updates.push('bottle_photo = ?'); params.push(await saveImage(bottleFile.buffer, 'bottle', ownerId)); }

    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(req.params.id);
    await db.query(`UPDATE wines SET ${updates.join(', ')} WHERE id=?`, params);
    const [updated] = await db.query('SELECT * FROM wines WHERE id=?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/sharing/cave/:ownerId/wines/:id — delete a wine from owner's cave
router.delete('/cave/:ownerId/wines/:id', auth, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!await requireWriteAccess(req.user.id, ownerId, res)) return;

  try {
    const [r] = await db.query('DELETE FROM wines WHERE id=? AND user_id=?', [req.params.id, ownerId]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Vin introuvable' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/sharing/cave/:ownerId/wines/:id/drunk — toggle is_drunk in owner's cave
router.put('/cave/:ownerId/wines/:id/drunk', auth, async (req, res) => {
  const ownerId = parseInt(req.params.ownerId);
  if (!await requireWriteAccess(req.user.id, ownerId, res)) return;

  try {
    const [[wine]] = await db.query('SELECT id, is_drunk FROM wines WHERE id=? AND user_id=?', [req.params.id, ownerId]);
    if (!wine) return res.status(404).json({ error: 'Vin introuvable' });
    const nowDrunk = !wine.is_drunk;
    await db.query('UPDATE wines SET is_drunk=?, quantity=? WHERE id=?',
      [nowDrunk ? 1 : 0, nowDrunk ? 0 : 1, req.params.id]);
    res.json({ success: true, is_drunk: nowDrunk });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
