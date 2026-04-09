// src/routes/wines.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole, optionalAuth } = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
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

// ─── GET /api/wines ───────────────────────────────────────────────────────────
// visiteur/admin → tous les vins ; user → ses propres vins ; non-auth → catalogue public
router.get('/', optionalAuth, async (req, res) => {
  const { search, type, status, region, page = 1, limit = 50, sort = 'created_at', order = 'DESC' } = req.query;
  const role = req.user?.role || 'guest';
  const cacheKey = `wines:${role === 'user' ? req.user.id : 'all'}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let where = [];
    let params = [];

    // Filter based on role
    if (role === 'user') {
      where.push('w.user_id = ?');
      params.push(req.user.id);
    } else if (role === 'guest') {
      // Public catalog: check that public catalog is enabled
      const [cfg] = await db.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'public_catalog'`
      );
      if (!cfg[0] || cfg[0].setting_value !== '1') {
        return res.status(401).json({ error: 'Authentification requise', code: 'TOKEN_MISSING' });
      }
    }

    if (search) {
      where.push('MATCH(w.name, w.appellation, w.producer, w.region, w.grapes) AGAINST(? IN BOOLEAN MODE)');
      params.push(`*${search}*`);
    }
    if (type)  { where.push('w.type = ?'); params.push(type); }
    if (status === 'stock') { where.push('w.is_drunk = 0 AND w.quantity > 0'); }
    if (status === 'drunk') { where.push('(w.is_drunk = 1 OR w.quantity = 0)'); }
    if (region) { where.push('w.region LIKE ?'); params.push(`%${region}%`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const safeCols = { name: 'w.name', vintage: 'w.vintage', created_at: 'w.created_at', price: 'w.price', quantity: 'w.quantity' };
    const orderCol = safeCols[sort] || 'w.created_at';
    const orderDir = order === 'ASC' ? 'ASC' : 'DESC';
    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
    const lim = Math.min(100, parseInt(limit));

    const sql = `SELECT w.*, u.username as owner_username,
      GROUP_CONCAT(JSON_OBJECT('id',a.id,'food',a.food,'stars',a.stars,'notes',a.notes)) as accords_raw
      FROM wines w
      LEFT JOIN users u ON u.id = w.user_id
      LEFT JOIN wine_accords a ON a.wine_id = w.id
      ${whereClause}
      GROUP BY w.id
      ORDER BY (w.is_drunk = 0 AND w.quantity > 0) DESC, ${orderCol} ${orderDir}
      LIMIT ? OFFSET ?`;
    params.push(lim, offset);

    const [rows] = await db.query(sql, params);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM wines w ${whereClause}`,
      params.slice(0, -2)
    );

    const wines = rows.map(w => ({
      ...w,
      accords: w.accords_raw
        ? [...new Map(w.accords_raw.split('},{').map(s => {
            try { const o = JSON.parse(s.startsWith('{') ? s : '{' + s); return [o.id, o]; }
            catch { return [null, null]; }
          }).filter(([k]) => k)).values()]
        : [],
      accords_raw: undefined,
    }));

    const result = { wines, total, page: parseInt(page), pages: Math.ceil(total / lim) };
    await cacheSet(cacheKey, result, 60);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST /api/wines — visiteur interdit ─────────────────────────────────────
router.post('/', auth, requireRole('user', 'admin'), uploadFields, async (req, res) => {
  const { name, appellation, vintage, type, producer, region, grapes, country, quantity, position, price, keep_until, notes,
          domain_website, domain_description, soil_type, altitude } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });

  try {
    const labelFile = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    const labelUrl  = labelFile  ? await saveImage(labelFile.buffer,  'label',  req.user.id) : null;
    const bottleUrl = bottleFile ? await saveImage(bottleFile.buffer, 'bottle', req.user.id) : null;

    const [result] = await db.query(
      `INSERT INTO wines (user_id,name,appellation,vintage,type,producer,region,grapes,country,quantity,position,price,keep_until,notes,label_image,bottle_photo,domain_website,domain_description,soil_type,altitude)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, name, appellation||null, vintage||null, type, producer||null, region||null, grapes||null,
       country||'France', quantity||1, position||null, price||null, keep_until||null, notes||null,
       labelUrl, bottleUrl, domain_website||null, domain_description||null, soil_type||null, altitude||null]
    );
    await cacheDel(`wines:${req.user.id}:*`);
    await cacheDel('wines:all:*');
    const [rows] = await db.query('SELECT * FROM wines WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── PUT /api/wines/:id — visiteur interdit ───────────────────────────────────
router.put('/:id', auth, requireRole('user', 'admin'), uploadFields, async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';
  try {
    const condition = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
    const condParams = isAdmin ? [id] : [id, req.user.id];
    const [rows] = await db.query(`SELECT id, user_id FROM wines WHERE ${condition}`, condParams);
    if (!rows.length) return res.status(404).json({ error: 'Vin introuvable' });

    const fields = ['name','appellation','vintage','type','producer','region','grapes','country','quantity','position',
                    'price','keep_until','notes','is_drunk','domain_website','domain_description','soil_type','altitude'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });

    const labelFile  = req.files?.label?.[0];
    const bottleFile = req.files?.bottle_photo?.[0];
    if (labelFile)  { updates.push('label_image = ?');  params.push(await saveImage(labelFile.buffer,  'label',  req.user.id)); }
    if (bottleFile) { updates.push('bottle_photo = ?'); params.push(await saveImage(bottleFile.buffer, 'bottle', req.user.id)); }

    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(id);
    await db.query(`UPDATE wines SET ${updates.join(', ')} WHERE id = ?`, params);
    await cacheDel(`wines:${rows[0].user_id}:*`);
    await cacheDel('wines:all:*');
    const [updated] = await db.query('SELECT * FROM wines WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── DELETE /api/wines/:id — visiteur interdit ────────────────────────────────
router.delete('/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const condition = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
    const condParams = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
    const [r] = await db.query(`DELETE FROM wines WHERE ${condition}`, condParams);
    if (!r.affectedRows) return res.status(404).json({ error: 'Vin introuvable' });
    await cacheDel(`wines:${req.user.id}:*`);
    await cacheDel('wines:all:*');
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST /api/wines/:id/accords — visiteur interdit ─────────────────────────
router.post('/:id/accords', auth, requireRole('user', 'admin'),
  [body('food').notEmpty(), body('stars').isInt({ min: 1, max: 5 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const isAdmin = req.user.role === 'admin';
    try {
      const condition = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
      const condParams = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
      const [wine] = await db.query(`SELECT id FROM wines WHERE ${condition}`, condParams);
      if (!wine.length) return res.status(404).json({ error: 'Vin introuvable' });
      const [r] = await db.query(
        'INSERT INTO wine_accords (wine_id,user_id,food,stars,notes) VALUES (?,?,?,?,?)',
        [req.params.id, req.user.id, req.body.food, req.body.stars, req.body.notes || null]
      );
      await cacheDel('wines:all:*');
      res.status(201).json({ id: r.insertId, food: req.body.food, stars: req.body.stars, notes: req.body.notes });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
  }
);

// ─── GET /api/wines/export — export as CSV ───────────────────────────────────
router.get('/export', auth, async (req, res) => {
  const role = req.user.role;
  try {
    const condition = role === 'user' ? 'WHERE user_id = ?' : '';
    const params = role === 'user' ? [req.user.id] : [];
    const [rows] = await db.query(
      `SELECT name, appellation, vintage, type, producer, region, country, grapes,
              quantity, price, keep_until, position, notes, is_drunk, created_at
       FROM wines ${condition} ORDER BY name`, params
    );
    const headers = ['name','appellation','vintage','type','producer','region','country','grapes',
                     'quantity','price','keep_until','position','notes','is_drunk','created_at'];
    const escape = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cave-vigne-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST /api/wines/import — import from CSV ─────────────────────────────────
router.post('/import', auth, requireRole('user','admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ error: 'Fichier vide' });
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const VALID_TYPES = ['rouge','blanc','rosé','pétillant'];
    let inserted = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g) || [];
      const row = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim(); });
      if (!row.name) { skipped++; continue; }
      const type = VALID_TYPES.includes(row.type) ? row.type : 'rouge';
      await db.query(
        `INSERT INTO wines (user_id,name,appellation,vintage,type,producer,region,grapes,country,quantity,price,keep_until,position,notes,is_drunk)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user.id, row.name, row.appellation||null, row.vintage||null, type, row.producer||null,
         row.region||null, row.grapes||null, row.country||'France', parseInt(row.quantity)||1,
         parseFloat(row.price)||null, row.keep_until||null, row.position||null, row.notes||null,
         row.is_drunk === '1' ? 1 : 0]
      );
      inserted++;
    }
    await cacheDel(`wines:${req.user.id}:*`);
    await cacheDel('wines:all:*');
    res.json({ inserted, skipped });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/wines/stats ─────────────────────────────────────────────────────
// visiteur/admin → stats globales ; user → ses propres stats
router.get('/stats', auth, async (req, res) => {
  const role = req.user.role;
  const cacheKey = role === 'user' ? `stats:wines:${req.user.id}` : 'stats:wines:global';
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const userFilter = role === 'user' ? 'WHERE user_id = ?' : 'WHERE 1=1';
    const userParam  = role === 'user' ? [req.user.id] : [];

    const [[summary]] = await db.query(`SELECT
      COUNT(*) as total_refs,
      SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN quantity ELSE 0 END) as total_bottles,
      SUM(CASE WHEN is_drunk=1 OR quantity=0 THEN 1 ELSE 0 END) as drunk_count,
      COUNT(DISTINCT country) as countries,
      SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN COALESCE(price*quantity,0) ELSE 0 END) as cave_value
      FROM wines ${userFilter}`, userParam);

    const [byType] = await db.query(
      `SELECT type, COUNT(*) as count, SUM(quantity) as bottles FROM wines ${userFilter} AND is_drunk=0 AND quantity>0 GROUP BY type`.replace('WHERE 1=1 AND', 'WHERE'),
      userParam
    );
    const [byRegion] = await db.query(
      `SELECT region, country, SUM(quantity) as bottles FROM wines ${userFilter} AND is_drunk=0 AND quantity>0 GROUP BY region, country ORDER BY bottles DESC LIMIT 10`.replace('WHERE 1=1 AND', 'WHERE'),
      userParam
    );
    const [[avgRating]] = await db.query(
      `SELECT AVG(a.stars) as avg_stars FROM wine_accords a JOIN wines w ON w.id=a.wine_id ${role === 'user' ? 'WHERE w.user_id=?' : ''}`,
      role === 'user' ? [req.user.id] : []
    );

    const result = { ...summary, by_type: byType, by_region: byRegion, avg_rating: avgRating.avg_stars ? parseFloat(avgRating.avg_stars).toFixed(1) : null };
    await cacheSet(cacheKey, result, 120);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST /api/wines/:id/ai-enrich — enrichissement IA ───────────────────────
router.post('/:id/ai-enrich', auth, requireRole('user', 'admin'), async (req, res) => {
  const { callAI, checkAIAvailable } = require('../config/ai');
  try {
    const { ok, error: aiErr } = await checkAIAvailable();
    if (!ok) return res.status(503).json({ error: `IA indisponible : ${aiErr}` });

    const [wines] = await db.query(
      'SELECT * FROM wines WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!wines.length) return res.status(404).json({ error: 'Vin introuvable' });
    const w = wines[0];

    const known = [
      w.name       && `Nom : ${w.name}`,
      w.producer   && `Producteur : ${w.producer}`,
      w.vintage    && `Millésime : ${w.vintage}`,
      w.appellation&& `Appellation : ${w.appellation}`,
      w.region     && `Région : ${w.region}`,
      w.country    && `Pays : ${w.country}`,
      w.type       && `Type : ${w.type}`,
      w.grapes     && `Cépages : ${w.grapes}`,
    ].filter(Boolean).join('\n');

    const prompt = `Tu es un expert sommelier. Voici un vin :
${known}

Complète les informations manquantes grâce à ta connaissance de ce vin.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après :
{
  "region": "région viticole",
  "country": "pays",
  "appellation": "appellation AOC/AOP exacte",
  "grapes": "cépages principaux séparés par des virgules",
  "domain_description": "description du domaine en 2-3 phrases",
  "soil_type": "type de sol du vignoble",
  "keep_until": <année entière, ex: 2032>,
  "notes": "description organoleptique : robe, nez, bouche, finale (3-4 phrases)",
  "food_pairings": ["accord 1", "accord 2", "accord 3"]
}
Laisse un champ null si tu n'es pas certain. Ne retourne QUE le JSON.`;

    const text = await callAI([{ role: 'user', content: prompt }], 800);
    const match = text.match(/\{[\s\S]+\}/);
    if (!match) return res.status(500).json({ error: 'Réponse IA invalide' });
    const enriched = JSON.parse(match[0]);
    res.json({ enriched });
  } catch (err) {
    console.error('[ai-enrich]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/wines/barcode/:ean ──────────────────────────────────────────────
// Lookup chain: 1) local barcode_cache  2) Open Food Facts API  3) web scrapers
const { scrapeWineByEan, scrapeWineByName } = require('../services/wineScraper');

router.get('/barcode/:ean', auth, async (req, res) => {
  const { ean } = req.params;
  if (!/^\d{8,14}$/.test(ean)) return res.status(400).json({ error: 'Code-barres invalide (8-14 chiffres)' });

  try {
    // ── 1. Local cache ─────────────────────────────────────────────────────────
    const [cached] = await db.query('SELECT * FROM barcode_cache WHERE ean=?', [ean]);
    if (cached.length) {
      const c = cached[0];
      return res.json({
        name: c.name, producer: c.producer, vintage: c.vintage, type: c.type,
        region: c.region, country: c.country, grapes: c.grapes, notes: c.notes,
        label_url: c.label_url, source: c.source,
      });
    }

    // ── 2. Open Food Facts API ─────────────────────────────────────────────────
    let result = null;
    try {
      const offUrl = `https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
      const resp = await fetch(offUrl, { signal: AbortSignal.timeout(6000) });
      const data = await resp.json();
      if (data.status === 1) {
        const p = data.product;
        const name    = p.product_name_fr || p.product_name || '';
        const producer = p.brands || '';
        const vintageM = name.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
        const cats = (p.categories_tags || []).join(' ').toLowerCase();
        let type = 'rouge';
        if (cats.includes('blanc') || cats.includes('white')) type = 'blanc';
        else if (cats.includes('rosé') || cats.includes('rose')) type = 'rosé';
        else if (cats.includes('pétillant') || cats.includes('sparkling') || cats.includes('champagne')) type = 'pétillant';

        result = {
          name, producer,
          vintage:   vintageM ? parseInt(vintageM[1]) : null,
          type,
          region:    p.origins || null,
          country:   (p.countries_tags?.[0] || 'France').replace(/^[a-z]{2}:/, '') || 'France',
          grapes:    p.ingredients_text_fr || p.ingredients_text || null,
          notes:     p.generic_name_fr || p.generic_name || null,
          label_url: p.image_front_url || p.image_url || null,
          source:    'off',
        };
      }
    } catch { /* OFF unavailable, continue to scrapers */ }

    // ── 3. Web scrapers (Vivino → Oeni → Liv-ex) ──────────────────────────────
    if (!result?.name) {
      const scraped = await scrapeWineByEan(ean);
      if (scraped) result = scraped;
    }

    if (!result) return res.status(404).json({ error: 'Produit introuvable' });

    // ── 4. Persist to local cache ─────────────────────────────────────────────
    try {
      await db.query(
        `INSERT INTO barcode_cache (ean,name,producer,vintage,type,region,country,grapes,notes,label_url,source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), producer=VALUES(producer), updated_at=NOW()`,
        [ean, result.name||null, result.producer||null, result.vintage||null,
         result.type||'rouge', result.region||null, result.country||'France',
         result.grapes||null, result.notes||null, result.label_url||null, result.source||'off']
      );
    } catch { /* non-blocking */ }

    res.json(result);
  } catch (err) {
    console.error('[barcode]', err.message);
    res.status(503).json({ error: 'Service indisponible' });
  }
});

// ─── GET /api/wines/value-history — cave value snapshots (last 90 days) ───────
router.get('/value-history', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT recorded_at, total_value, bottle_count, ref_count
       FROM cave_value_history WHERE user_id=? ORDER BY recorded_at ASC LIMIT 90`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/wines/:id/enrich — enrichissement multi-sources ────────────────
// Sources: Vivino API → Open Food Facts → Vinatis scraper → La Revue du Vin de France
const { scrapeWineByName, vivinoSearch } = require('../services/wineScraper');
const cheerio = require('cheerio');

async function scrapeVinatis(query) {
  try {
    const url = `https://www.vinatis.com/recherche?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const $ = cheerio.load(await resp.text());
    // Vinatis product cards
    const card = $('.product-item, .product_item, [class*="product-card"]').first();
    if (!card.length) return null;
    const name    = card.find('[class*="product-name"], h2, h3').first().text().trim();
    const producer = card.find('[class*="brand"], [class*="producer"], [class*="domaine"]').first().text().trim();
    const priceText = card.find('[class*="price"], .price').first().text().trim();
    const price = priceText ? parseFloat(priceText.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
    const img   = card.find('img').first().attr('src') || null;
    if (!name) return null;
    return { source: 'Vinatis', name, producer: producer || null, price: price || null, label_image: img || null };
  } catch { return null; }
}

async function scrapeLRVF(query) {
  try {
    const url = `https://www.larvf.com/recherche/${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const $ = cheerio.load(await resp.text());
    const card = $('[class*="wine"], [class*="vin"], .search-result, article').first();
    if (!card.length) return null;
    const name   = card.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
    const rating = card.find('[class*="note"], [class*="rating"], [class*="score"]').first().text().trim();
    const notes  = card.find('[class*="desc"], [class*="note-text"], p').first().text().trim();
    if (!name) return null;
    return { source: 'La RVF', name, rating: rating || null, notes: notes?.slice(0, 200) || null };
  } catch { return null; }
}

router.get('/:id/enrich', auth, requireRole('user', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM wines WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vin introuvable' });
    const wine = rows[0];
    const query = [wine.name, wine.producer, wine.vintage].filter(Boolean).join(' ');
    const results = [];

    // ── 1. Vivino (best structured data) ────────────────────────────────────
    try {
      const v = await vivinoSearch(query);
      if (v?.name) results.push({
        source: 'Vivino', name: v.name, producer: v.producer || null,
        vintage: v.vintage || null, type: v.type || null,
        region: v.region || null, country: v.country || null,
        grapes: v.grapes || null, notes: v.notes || null,
        label_image: v.label_url || null,
      });
    } catch { /* continue */ }

    // ── 2. Open Food Facts ───────────────────────────────────────────────────
    try {
      const q = encodeURIComponent(query);
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&categories_tags=wines&action=process&json=1&page_size=3&fields=product_name,origins,countries_tags,brands,image_url,ingredients_text`;
      const r = await fetch(offUrl, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        (d.products || []).slice(0, 2).forEach(p => {
          if (!p.product_name) return;
          results.push({
            source:      'Open Food Facts',
            name:        p.product_name,
            producer:    p.brands || null,
            country:     (p.countries_tags?.[0] || '').replace(/^[a-z]{2}:/, '') || null,
            grapes:      p.ingredients_text || null,
            label_image: p.image_url || null,
          });
        });
      }
    } catch { /* continue */ }

    // ── 3. Vinatis ───────────────────────────────────────────────────────────
    try {
      const v = await scrapeVinatis(query);
      if (v) results.push(v);
    } catch { /* continue */ }

    // ── 4. La Revue du Vin de France ─────────────────────────────────────────
    try {
      const v = await scrapeLRVF(query);
      if (v) results.push(v);
    } catch { /* continue */ }

    // ── 5. Generic wine scraper (Oeni, Liv-ex fallback) ──────────────────────
    if (results.length === 0) {
      try {
        const scraped = await scrapeWineByName(wine.name, wine.producer);
        if (scraped?.name) results.push({
          source: scraped.source || 'Web', name: scraped.name,
          producer: scraped.producer || null, region: scraped.region || null,
          country: scraped.country || null, grapes: scraped.grapes || null,
          notes: scraped.notes || null, label_image: scraped.label_url || null,
        });
      } catch { /* continue */ }
    }

    res.json({ results, query });
  } catch (err) {
    console.error('[enrich]', err.message);
    res.json({ results: [], query: '', error: err.message });
  }
});

// ─── GET /api/wines/:id/market — recherche prix & disponibilité en ligne ───────
// Sources : Vivino (prix moyen), Vinatis, ideedelvin.fr, WineSearcher public
router.get('/:id/market', auth, requireRole('user', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM wines WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vin introuvable' });
    const wine = rows[0];
    const query = [wine.name, wine.producer, wine.vintage].filter(Boolean).join(' ');
    const results = [];

    // ── 1. Vivino public search — price data ──────────────────────────────
    try {
      const { data } = await require('axios').get('https://www.vivino.com/api/explore/explore', {
        params: { q: query, language: 'fr', country_code: 'fr', per_page: 3 },
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', 'Accept-Language': 'fr-FR,fr;q=0.9' },
        timeout: 7000,
      });
      const matches = data?.explore_vintage?.matches || [];
      matches.slice(0, 3).forEach(m => {
        const v = m.vintage;
        const w = v?.wine;
        const price = m.price?.amount || v?.statistics?.median_price_rounded || null;
        if (!w?.name) return;
        results.push({
          source: 'Vivino',
          source_url: `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`,
          name: w.name,
          vintage: v?.year || null,
          price_avg: price ? parseFloat(price) : null,
          currency: m.price?.currency || 'EUR',
          rating: v?.statistics?.wine_ratings_average || null,
          ratings_count: v?.statistics?.ratings_count || null,
          availability: price ? 'En ligne' : null,
        });
      });
    } catch { /* continue */ }

    // ── 2. Vinatis — French retailer ──────────────────────────────────────
    try {
      const url = `https://www.vinatis.com/recherche?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR,fr;q=0.9' },
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const $ = cheerio.load(await resp.text());
        $('.product-item, [class*="product-card"]').slice(0, 3).each((_i, el) => {
          const name      = $(el).find('[class*="product-name"], h2, h3').first().text().trim();
          const priceText = $(el).find('[class*="price"]').first().text().trim();
          const price     = priceText ? parseFloat(priceText.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
          const inStock   = $(el).find('[class*="stock"], [class*="dispo"]').text().toLowerCase().includes('stock');
          if (!name) return;
          results.push({
            source: 'Vinatis',
            source_url: url,
            name,
            price_avg: price || null,
            currency: 'EUR',
            availability: inStock ? 'En stock' : (price ? 'Voir le site' : null),
          });
        });
      }
    } catch { /* continue */ }

    // ── 3. iDéal du Vin / ideadelvin.fr ──────────────────────────────────
    try {
      const url = `https://www.idealwine.com/fr/recherche/index.jsp?textRecherche=${encodeURIComponent(query)}&typeRecherche=full_text`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR,fr;q=0.9' },
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const $ = cheerio.load(await resp.text());
        const first = $('[class*="product"], .wine-item, article').first();
        if (first.length) {
          const name      = first.find('h2, h3, [class*="name"]').first().text().trim();
          const priceText = first.find('[class*="price"], [class*="prix"]').first().text().trim();
          const price     = priceText ? parseFloat(priceText.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
          if (name) results.push({
            source: 'iDéalwine',
            source_url: url,
            name,
            price_avg: price || null,
            currency: 'EUR',
            availability: price ? 'Enchères' : 'Voir le site',
          });
        }
      }
    } catch { /* continue */ }

    res.json({ results, query, wine: { name: wine.name, vintage: wine.vintage, producer: wine.producer } });
  } catch (err) {
    console.error('[market]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
