// src/routes/spirits.js
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');

router.get('/', auth, async (req, res) => {
  const { search, type, status } = req.query;
  const cacheKey = `spirits:${req.user.id}:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    let where = ['user_id = ?']; let params = [req.user.id];
    if (search) { where.push('(name LIKE ? OR origin LIKE ? OR producer LIKE ?)'); params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
    if (type) { where.push('type = ?'); params.push(type); }
    if (status) { where.push('status = ?'); params.push(status); }
    const [spirits] = await db.query(`SELECT * FROM spirits WHERE ${where.join(' AND ')} ORDER BY FIELD(status,'stock','open','empty'), created_at DESC`, params);
    await cacheSet(cacheKey, spirits, 60);
    res.json(spirits);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, async (req, res) => {
  const { name, type, producer, origin, age, abv, status, price, rating, quantity, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nom et type requis' });
  try {
    const [r] = await db.query(
      'INSERT INTO spirits (user_id,name,type,producer,origin,age,abv,status,price,rating,quantity,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, name, type, producer||null, origin||null, age||null, abv||null, status||'stock', price||null, rating||null, quantity||1, notes||null]
    );
    await cacheDel(`spirits:${req.user.id}:*`);
    const [rows] = await db.query('SELECT * FROM spirits WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const fields = ['name','type','producer','origin','age','abv','status','price','rating','quantity','notes'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(req.params.id, req.user.id);
    const [r] = await db.query(`UPDATE spirits SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    await cacheDel(`spirits:${req.user.id}:*`);
    const [rows] = await db.query('SELECT * FROM spirits WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM spirits WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    await cacheDel(`spirits:${req.user.id}:*`);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
