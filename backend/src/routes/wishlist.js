// src/routes/wishlist.js — Wishlist CRUD
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// GET /api/wishlist
router.get('/', auth, requireRole('user', 'admin'), async (req, res) => {
  const { found } = req.query;
  try {
    let where = 'user_id = ?';
    const params = [req.user.id];
    if (found !== undefined) { where += ' AND found = ?'; params.push(found === '1' ? 1 : 0); }
    const [rows] = await db.query(
      `SELECT * FROM wishlist WHERE ${where} ORDER BY priority DESC, created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/wishlist
router.post('/', auth, requireRole('user', 'admin'), async (req, res) => {
  const { name, producer, vintage, type, region, priority, price_max, url, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const [r] = await db.query(
      `INSERT INTO wishlist (user_id,name,producer,vintage,type,region,priority,price_max,url,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, name, producer||null, vintage||null, type||'rouge', region||null,
       priority||'medium', price_max||null, url||null, notes||null]
    );
    const [rows] = await db.query('SELECT * FROM wishlist WHERE id=?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/wishlist/:id
router.put('/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id FROM wishlist WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
    const fields = ['name','producer','vintage','type','region','priority','price_max','url','notes','found'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); params.push(req.body[f]); } });
    if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
    params.push(req.params.id);
    await db.query(`UPDATE wishlist SET ${updates.join(', ')} WHERE id=?`, params);
    const [updated] = await db.query('SELECT * FROM wishlist WHERE id=?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/wishlist/:id
router.delete('/:id', auth, requireRole('user', 'admin'), async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM wishlist WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
