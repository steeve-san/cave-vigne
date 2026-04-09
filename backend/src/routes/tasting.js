// src/routes/tasting.js — Tasting journal CRUD with photo support
const router = require('express').Router();
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

async function saveTastingPhoto(buffer, userId) {
  const dir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `tasting_${userId}_${Date.now()}.webp`;
  await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(path.join(dir, filename));
  return `/uploads/${filename}`;
}

// GET /api/tasting/:wineId — list tasting notes for a wine
router.get('/:wineId', auth, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const condition = isAdmin
      ? 'wine_id = ?'
      : 'wine_id = ? AND user_id = ?';
    const params = isAdmin ? [req.params.wineId] : [req.params.wineId, req.user.id];
    const [rows] = await db.query(
      `SELECT t.*, u.username FROM tasting_notes t
       JOIN users u ON u.id = t.user_id
       WHERE ${condition} ORDER BY t.tasted_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/tasting/:wineId — add a tasting note (with optional photo)
router.post('/:wineId', auth, requireRole('user', 'admin'), upload.single('photo'), async (req, res) => {
  const { tasted_at, rating, color_desc, nose, palate, finish, overall } = req.body;
  if (!tasted_at) return res.status(400).json({ error: 'Date requise' });
  try {
    const isAdmin = req.user.role === 'admin';
    const [wines] = await db.query(
      isAdmin ? 'SELECT id FROM wines WHERE id=?' : 'SELECT id FROM wines WHERE id=? AND user_id=?',
      isAdmin ? [req.params.wineId] : [req.params.wineId, req.user.id]
    );
    if (!wines.length) return res.status(404).json({ error: 'Vin introuvable' });

    const photoUrl = req.file ? await saveTastingPhoto(req.file.buffer, req.user.id) : null;

    const [result] = await db.query(
      `INSERT INTO tasting_notes (wine_id,user_id,tasted_at,rating,color_desc,nose,palate,finish,overall,photo_url)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.params.wineId, req.user.id, tasted_at, rating||null, color_desc||null,
       nose||null, palate||null, finish||null, overall||null, photoUrl]
    );
    const [rows] = await db.query('SELECT * FROM tasting_notes WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/tasting/note/:id — update a tasting note
router.put('/note/:id', auth, requireRole('user', 'admin'), upload.single('photo'), async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const [rows] = await db.query(
      isAdmin ? 'SELECT id FROM tasting_notes WHERE id=?' : 'SELECT id FROM tasting_notes WHERE id=? AND user_id=?',
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Note introuvable' });

    const fields = ['tasted_at','rating','color_desc','nose','palate','finish','overall'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); params.push(req.body[f]); } });

    if (req.file) {
      const photoUrl = await saveTastingPhoto(req.file.buffer, req.user.id);
      updates.push('photo_url=?');
      params.push(photoUrl);
    }

    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(req.params.id);
    await db.query(`UPDATE tasting_notes SET ${updates.join(', ')} WHERE id=?`, params);
    const [updated] = await db.query('SELECT * FROM tasting_notes WHERE id=?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/tasting/note/:id
router.delete('/note/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const condition = isAdmin ? 'id=?' : 'id=? AND user_id=?';
    const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
    const [r] = await db.query(`DELETE FROM tasting_notes WHERE ${condition}`, params);
    if (!r.affectedRows) return res.status(404).json({ error: 'Note introuvable' });
    res.json({ message: 'Supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
