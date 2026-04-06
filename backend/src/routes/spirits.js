// src/routes/spirits.js
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');

// ─── GET /api/spirits — visiteur/admin → tous ; user → les siens ──────────────
router.get('/', auth, async (req, res) => {
  const { search, type, status } = req.query;
  const role = req.user.role;
  const cacheKey = `spirits:${role === 'user' ? req.user.id : 'all'}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    let where = []; let params = [];
    if (role === 'user') { where.push('s.user_id = ?'); params.push(req.user.id); }
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
router.post('/', auth, requireRole('user', 'admin'), async (req, res) => {
  const { name, type, producer, origin, age, abv, status, price, rating, quantity, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });
  try {
    const [r] = await db.query(
      'INSERT INTO spirits (user_id,name,type,producer,origin,age,abv,status,price,rating,quantity,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, name, type, producer||null, origin||null, age||null, abv||null, status||'stock', price||null, rating||null, quantity||1, notes||null]
    );
    await cacheDel(`spirits:${req.user.id}:*`);
    await cacheDel('spirits:all:*');
    const [rows] = await db.query('SELECT * FROM spirits WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── PUT — visiteur interdit ──────────────────────────────────────────────────
router.put('/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const fields = ['name','type','producer','origin','age','abv','status','price','rating','quantity','notes'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
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
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
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

module.exports = router;
