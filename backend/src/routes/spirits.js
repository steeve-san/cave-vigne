// src/routes/spirits.js
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole, optionalAuth } = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10485760 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});
const uploadFields = upload.fields([{ name: 'label', maxCount: 1 }, { name: 'bottle_photo', maxCount: 1 }]);

async function saveImage(buffer, prefix, userId) {
  const dir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${prefix}_${userId}_${Date.now()}.webp`;
  await sharp(buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, filename));
  return `/uploads/${filename}`;
}

// ─── GET /api/spirits — visiteur/admin → tous ; user → les siens ; guest → public ──
router.get('/', optionalAuth, async (req, res) => {
  const { search, type, status } = req.query;
  const role = req.user?.role || 'guest';
  const cacheKey = `spirits:${role === 'user' ? req.user.id : 'all'}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let where = []; let params = [];
    if (role === 'user') {
      where.push('s.user_id = ?'); params.push(req.user.id);
    } else if (role === 'guest') {
      const [cfg] = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'public_catalog'`);
      if (!cfg[0] || cfg[0].setting_value !== '1')
        return res.status(401).json({ error: 'Authentification requise', code: 'TOKEN_MISSING' });
    }
    if (search) { where.push('(s.name LIKE ? OR s.origin LIKE ? OR s.producer LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (type)   { where.push('s.type = ?'); params.push(type); }
    if (status) { where.push('s.status = ?'); params.push(status); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [spirits] = await db.query(
      `SELECT s.*, u.username as owner_username FROM spirits s
       LEFT JOIN users u ON u.id = s.user_id
       ${whereClause}
       ORDER BY FIELD(s.status,'stock','open','empty'), s.created_at DESC`,
      params
    );
    await cacheSet(cacheKey, spirits, 60);
    res.json(spirits);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST — visiteur interdit ─────────────────────────────────────────────────
router.post('/', auth, requireRole('user', 'admin'), uploadFields, async (req, res) => {
  const { name, type, producer, origin, age, abv, status, price, rating, quantity, notes,
          domain_website, domain_description } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });
  try {
    const labelFile  = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    const labelUrl   = labelFile  ? await saveImage(labelFile.buffer,  'label',  req.user.id) : null;
    const bottleUrl  = bottleFile ? await saveImage(bottleFile.buffer, 'bottle', req.user.id) : null;

    const [r] = await db.query(
      `INSERT INTO spirits (user_id,name,type,producer,origin,age,abv,status,price,rating,quantity,notes,
        label_image,bottle_photo,domain_website,domain_description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, name, type, producer||null, origin||null, age||null, abv||null,
       status||'stock', price||null, rating||null, quantity||1, notes||null,
       labelUrl, bottleUrl, domain_website||null, domain_description||null]
    );
    await cacheDel(`spirits:${req.user.id}:*`);
    await cacheDel('spirits:all:*');
    const [rows] = await db.query('SELECT * FROM spirits WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── PUT — visiteur interdit ──────────────────────────────────────────────────
router.put('/:id', auth, requireRole('user', 'admin'), uploadFields, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const fields = ['name','type','producer','origin','age','abv','status','price','rating','quantity',
                    'notes','domain_website','domain_description'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });

    const labelFile  = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    if (labelFile)  { updates.push('label_image = ?');  params.push(await saveImage(labelFile.buffer,  'label',  req.user.id)); }
    if (bottleFile) { updates.push('bottle_photo = ?'); params.push(await saveImage(bottleFile.buffer, 'bottle', req.user.id)); }

    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    const condition = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
    const condParams = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
    params.push(...condParams);

    const [r] = await db.query(`UPDATE spirits SET ${updates.join(', ')} WHERE ${condition}`, params);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    await cacheDel(`spirits:${req.user.id}:*`);
    await cacheDel('spirits:all:*');
    const [rows] = await db.query('SELECT * FROM spirits WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── DELETE — visiteur interdit ───────────────────────────────────────────────
router.delete('/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const condition = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
  const condParams = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
  try {
    const [r] = await db.query(`DELETE FROM spirits WHERE ${condition}`, condParams);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    await cacheDel(`spirits:${req.user.id}:*`);
    await cacheDel('spirits:all:*');
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/spirits/barcode/:ean ────────────────────────────────────────────
// Même chaîne que /api/wines/barcode : cache local → OFF → scrapers
// Retourne des champs orientés spiritueux (name, producer, origin, notes)
const { scrapeWineByEan } = require('../services/wineScraper');

router.get('/barcode/:ean', auth, async (req, res) => {
  const { ean } = req.params;
  if (!/^\d{8,14}$/.test(ean)) return res.status(400).json({ error: 'Code-barres invalide (8–14 chiffres)' });

  try {
    // 1. Cache local
    const [cached] = await db.query('SELECT * FROM barcode_cache WHERE ean=?', [ean]);
    if (cached.length) {
      const c = cached[0];
      return res.json({
        name: c.name, producer: c.producer,
        origin: [c.region, c.country].filter(Boolean).join(', ') || null,
        notes: c.notes, label_url: c.label_url, source: c.source,
      });
    }

    // 2. Open Food Facts
    let result = null;
    try {
      const offUrl = `https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
      const resp = await fetch(offUrl, { signal: AbortSignal.timeout(6000) });
      const data = await resp.json();
      if (data.status === 1) {
        const p = data.product;
        result = {
          name:     p.product_name_fr || p.product_name || null,
          producer: p.brands || null,
          origin:   [p.origins, (p.countries_tags?.[0] || '').replace(/^[a-z]{2}:/, '')].filter(Boolean).join(', ') || null,
          notes:    p.generic_name_fr || p.generic_name || null,
          label_url: p.image_front_url || p.image_url || null,
          source:   'off',
        };
      }
    } catch { /* continue */ }

    // 3. Scrapers
    if (!result?.name) {
      const scraped = await scrapeWineByEan(ean);
      if (scraped) {
        result = {
          name:     scraped.name || null,
          producer: scraped.producer || null,
          origin:   [scraped.region, scraped.country].filter(Boolean).join(', ') || null,
          notes:    scraped.notes || null,
          label_url: scraped.label_url || null,
          source:   scraped.source,
        };
      }
    }

    if (!result) return res.status(404).json({ error: 'Produit introuvable' });

    // 4. Persist cache
    try {
      await db.query(
        `INSERT INTO barcode_cache (ean,name,producer,country,notes,label_url,source)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), producer=VALUES(producer), updated_at=NOW()`,
        [ean, result.name||null, result.producer||null, null, result.notes||null, result.label_url||null, result.source||'off']
      );
    } catch { /* non-blocking */ }

    res.json(result);
  } catch (err) {
    console.error('[spirits/barcode]', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

module.exports = router;
