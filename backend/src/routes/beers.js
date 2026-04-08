// src/routes/beers.js — Collection de bières
const router = require('express').Router();
const db   = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const multer = require('multer');
const path   = require('path');
const sharp  = require('sharp');
const fs     = require('fs');
const { scrapeBeerByEan, mapBeerType } = require('../services/wineScraper');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

async function saveImage(buffer, userId) {
  const dir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `beer_${userId}_${Date.now()}.webp`;
  await sharp(buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(dir, filename));
  return `/uploads/${filename}`;
}

// ─── GET /api/beers ───────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  const { search, type, status } = req.query;
  const cacheKey = `beers:${req.user.id}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let where = ['user_id = ?'];
    const params = [req.user.id];

    if (search) {
      where.push('(name LIKE ? OR brewery LIKE ? OR region LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type && type !== 'all') { where.push('type = ?'); params.push(type); }
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }

    const [beers] = await db.query(
      `SELECT * FROM beers WHERE ${where.join(' AND ')} ORDER BY status ASC, name ASC`,
      params
    );
    await cacheSet(cacheKey, beers, 60);
    res.json(beers);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/beers/stats ─────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const [[stats]] = await db.query(
      `SELECT COUNT(*) as total_refs,
              SUM(quantity) as total_bottles,
              SUM(COALESCE(price * quantity, 0)) as total_value,
              COUNT(DISTINCT brewery) as breweries,
              COUNT(DISTINCT country) as countries
       FROM beers WHERE user_id=? AND status != 'empty'`,
      [req.user.id]
    );
    const [byType] = await db.query(
      `SELECT type, COUNT(*) as refs, SUM(quantity) as bottles
       FROM beers WHERE user_id=? AND status != 'empty' GROUP BY type`,
      [req.user.id]
    );
    res.json({ ...stats, by_type: byType });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/beers/barcode/:ean ──────────────────────────────────────────────
// Chain: local barcode_cache → OFF API → V&B / Untappd / RateBeer scrapers
router.get('/barcode/:ean', auth, async (req, res) => {
  const { ean } = req.params;
  if (!/^\d{8,14}$/.test(ean)) return res.status(400).json({ error: 'Code-barres invalide (8–14 chiffres)' });

  try {
    // 1. Local cache
    const [cached] = await db.query('SELECT * FROM barcode_cache WHERE ean=?', [ean]);
    if (cached.length) {
      const c = cached[0];
      return res.json({
        name: c.name, brewery: c.producer,
        type: mapBeerType(c.type || c.notes),
        country: c.country, region: c.region,
        notes: c.notes, label_url: c.label_url, source: c.source,
      });
    }

    // 2. Open Food Facts — beers are in categories_tags
    let result = null;
    try {
      const resp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`, { signal: AbortSignal.timeout(6000) });
      const data = await resp.json();
      if (data.status === 1) {
        const p = data.product;
        const name    = p.product_name_fr || p.product_name || null;
        const brewery = p.brands || null;
        const cats    = (p.categories_tags || []).join(' ').toLowerCase();
        const abvText = p.nutriments?.['alcohol'] || p.nutriments?.['alcohol_100g'];
        result = {
          name, brewery,
          type:      mapBeerType(cats),
          country:   (p.countries_tags?.[0] || '').replace(/^[a-z]{2}:/, '') || null,
          abv:       abvText ? parseFloat(abvText) : null,
          notes:     p.generic_name_fr || p.generic_name || null,
          label_url: p.image_front_url || p.image_url || null,
          source:    'off',
        };
      }
    } catch { /* continue */ }

    // 3. Beer scrapers
    if (!result?.name) {
      const scraped = await scrapeBeerByEan(ean);
      if (scraped) result = scraped;
    }

    if (!result) return res.status(404).json({ error: 'Produit introuvable' });

    // 4. Persist to cache
    try {
      await db.query(
        `INSERT INTO barcode_cache (ean,name,producer,country,notes,label_url,source)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), producer=VALUES(producer), updated_at=NOW()`,
        [ean, result.name||null, result.brewery||null, result.country||null,
         result.notes||null, result.label_url||null, result.source||'off']
      );
    } catch { /* non-blocking */ }

    res.json(result);
  } catch (err) {
    console.error('[beers/barcode]', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

// ─── POST /api/beers ──────────────────────────────────────────────────────────
router.post('/', auth, requireRole('user', 'admin'), upload.single('label'), async (req, res) => {
  const { name, brewery, type, country, region, abv, ibu, volume, quantity, price, rating, status, notes, ean } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });

  try {
    const labelUrl = req.file ? await saveImage(req.file.buffer, req.user.id) : null;
    const [result] = await db.query(
      `INSERT INTO beers (user_id,name,brewery,type,country,region,abv,ibu,volume,quantity,price,rating,status,notes,label_image,ean)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, name, brewery||null, type, country||'France', region||null,
       abv||null, ibu||null, volume||33, quantity||1, price||null,
       rating||null, status||'stock', notes||null, labelUrl, ean||null]
    );
    await cacheDel(`beers:${req.user.id}:*`);
    const [rows] = await db.query('SELECT * FROM beers WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── PUT /api/beers/:id ───────────────────────────────────────────────────────
router.put('/:id', auth, upload.single('label'), async (req, res) => {
  try {
    const [check] = await db.query('SELECT id FROM beers WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!check.length) return res.status(404).json({ error: 'Introuvable' });

    const fields = ['name','brewery','type','country','region','abv','ibu','volume','quantity','price','rating','status','notes','ean'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); params.push(req.body[f]); } });
    if (req.file) { updates.push('label_image=?'); params.push(await saveImage(req.file.buffer, req.user.id)); }

    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(req.params.id);
    await db.query(`UPDATE beers SET ${updates.join(',')} WHERE id=?`, params);
    await cacheDel(`beers:${req.user.id}:*`);
    const [rows] = await db.query('SELECT * FROM beers WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── DELETE /api/beers/:id ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM beers WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    await cacheDel(`beers:${req.user.id}:*`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
