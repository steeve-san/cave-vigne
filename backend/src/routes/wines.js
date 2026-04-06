// src/routes/wines.js
const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 }, fileFilter: (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
  cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
}});

// GET /api/wines — liste avec cache
router.get('/', auth, async (req, res) => {
  const { search, type, status, region, page = 1, limit = 50, sort = 'created_at', order = 'DESC' } = req.query;
  const cacheKey = `wines:${req.user.id}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let where = ['w.user_id = ?'];
    let params = [req.user.id];
    if (search) { where.push('MATCH(w.name, w.appellation, w.producer, w.region, w.grapes) AGAINST(? IN BOOLEAN MODE)'); params.push(`*${search}*`); }
    if (type) { where.push('w.type = ?'); params.push(type); }
    if (status === 'stock') { where.push('w.is_drunk = 0 AND w.quantity > 0'); }
    if (status === 'drunk') { where.push('(w.is_drunk = 1 OR w.quantity = 0)'); }
    if (region) { where.push('w.region LIKE ?'); params.push(`%${region}%`); }

    const safeCols = { name: 'w.name', vintage: 'w.vintage', created_at: 'w.created_at', price: 'w.price', quantity: 'w.quantity' };
    const orderCol = safeCols[sort] || 'w.created_at';
    const orderDir = order === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
    const lim = Math.min(100, parseInt(limit));

    const sql = `SELECT w.*, GROUP_CONCAT(JSON_OBJECT('id',a.id,'food',a.food,'stars',a.stars,'notes',a.notes)) as accords_raw
      FROM wines w LEFT JOIN wine_accords a ON a.wine_id = w.id
      WHERE ${where.join(' AND ')} GROUP BY w.id ORDER BY (w.is_drunk = 0 AND w.quantity > 0) DESC, ${orderCol} ${orderDir} LIMIT ? OFFSET ?`;
    params.push(lim, offset);

    const [rows] = await db.query(sql, params);
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM wines w WHERE ${where.slice(0,-0).join(' AND ')}`, params.slice(0,-2));

    const wines = rows.map(w => ({
      ...w,
      accords: w.accords_raw ? [...new Map(w.accords_raw.split('},{').map(s => { try { const o = JSON.parse(s.startsWith('{') ? s : '{' + s); return [o.id, o]; } catch { return [null, null]; } }).filter(([k]) => k)).values()] : [],
      accords_raw: undefined
    }));

    const result = { wines, total, page: parseInt(page), pages: Math.ceil(total / lim) };
    await cacheSet(cacheKey, result, 60);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/wines
router.post('/', auth, upload.single('label'), async (req, res) => {
  const { name, appellation, vintage, type, producer, region, grapes, country, quantity, position, price, keep_until, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });

  try {
    let labelUrl = null;
    if (req.file) {
      const dir = process.env.UPLOAD_DIR || './uploads';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `label_${req.user.id}_${Date.now()}.webp`;
      await sharp(req.file.buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, filename));
      labelUrl = `/uploads/${filename}`;
    }
    const [result] = await db.query(
      `INSERT INTO wines (user_id,name,appellation,vintage,type,producer,region,grapes,country,quantity,position,price,keep_until,notes,label_image)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, name, appellation||null, vintage||null, type, producer||null, region||null, grapes||null, country||'France', quantity||1, position||null, price||null, keep_until||null, notes||null, labelUrl]
    );
    await cacheDel(`wines:${req.user.id}:*`);
    const [rows] = await db.query('SELECT * FROM wines WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/wines/:id
router.put('/:id', auth, upload.single('label'), async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT id FROM wines WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vin introuvable' });

    const fields = ['name','appellation','vintage','type','producer','region','grapes','country','quantity','position','price','keep_until','notes','is_drunk'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });

    if (req.file) {
      const dir = process.env.UPLOAD_DIR || './uploads';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `label_${req.user.id}_${Date.now()}.webp`;
      await sharp(req.file.buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, filename));
      updates.push('label_image = ?'); params.push(`/uploads/${filename}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(id, req.user.id);
    await db.query(`UPDATE wines SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params);
    await cacheDel(`wines:${req.user.id}:*`);
    const [updated] = await db.query('SELECT * FROM wines WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/wines/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM wines WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Vin introuvable' });
    await cacheDel(`wines:${req.user.id}:*`);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/wines/:id/accords
router.post('/:id/accords', auth, [body('food').notEmpty(), body('stars').isInt({ min: 1, max: 5 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const [wine] = await db.query('SELECT id FROM wines WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!wine.length) return res.status(404).json({ error: 'Vin introuvable' });
    const [r] = await db.query('INSERT INTO wine_accords (wine_id,user_id,food,stars,notes) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, req.body.food, req.body.stars, req.body.notes || null]);
    await cacheDel(`wines:${req.user.id}:*`);
    res.status(201).json({ id: r.insertId, food: req.body.food, stars: req.body.stars, notes: req.body.notes });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/wines/stats
router.get('/stats', auth, async (req, res) => {
  const cacheKey = `stats:wines:${req.user.id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [[summary]] = await db.query(`SELECT
      COUNT(*) as total_refs,
      SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN quantity ELSE 0 END) as total_bottles,
      SUM(CASE WHEN is_drunk=1 OR quantity=0 THEN 1 ELSE 0 END) as drunk_count,
      COUNT(DISTINCT country) as countries,
      SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN COALESCE(price*quantity,0) ELSE 0 END) as cave_value
      FROM wines WHERE user_id=?`, [req.user.id]);
    const [byType] = await db.query('SELECT type, COUNT(*) as count, SUM(quantity) as bottles FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 GROUP BY type', [req.user.id]);
    const [byRegion] = await db.query('SELECT region, country, SUM(quantity) as bottles FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 GROUP BY region, country ORDER BY bottles DESC LIMIT 10', [req.user.id]);
    const [[avgRating]] = await db.query('SELECT AVG(a.stars) as avg_stars FROM wine_accords a JOIN wines w ON w.id=a.wine_id WHERE w.user_id=?', [req.user.id]);
    const result = { ...summary, by_type: byType, by_region: byRegion, avg_rating: avgRating.avg_stars ? parseFloat(avgRating.avg_stars).toFixed(1) : null };
    await cacheSet(cacheKey, result, 120);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
