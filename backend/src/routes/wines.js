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

// ─── GET /api/wines/:id/enrich — enrichissement depuis sources externes ────────
// Open Food Facts (free, no key required)
router.get('/:id/enrich', auth, requireRole('user', 'admin'), async (req, res) => {
  try {
    const [wines] = await db.query('SELECT * FROM wines WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!wines.length) return res.status(404).json({ error: 'Vin introuvable' });
    const wine = wines[0];
    const q = encodeURIComponent(wine.name + (wine.producer ? ' ' + wine.producer : ''));

    // Open Food Facts
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&categories_tags=wines&action=process&json=1&page_size=3&fields=product_name,origins,countries,brands,categories,image_url,ingredients_text`;
    const response = await fetch(offUrl, { signal: AbortSignal.timeout(8000) });
    const data = response.ok ? await response.json() : { products: [] };
    const products = (data.products || []).map(p => ({
      source:       'Open Food Facts',
      name:         p.product_name || '',
      producer:     p.brands || '',
      country:      p.countries || '',
      grapes:       p.ingredients_text || '',
      label_image:  p.image_url || '',
      origins:      p.origins || '',
    })).filter(p => p.name);

    res.json({ results: products, query: wine.name });
  } catch (err) {
    console.error('[enrich]', err.message);
    res.json({ results: [], query: '', error: err.message });
  }
});

module.exports = router;
