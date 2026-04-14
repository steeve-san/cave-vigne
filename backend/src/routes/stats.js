// src/routes/stats.js — statistiques avancées de la cave
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { cacheGet, cacheSet } = require('../config/redis');

// GET /api/stats/advanced — stock par région, par type, rotation annuelle, pays
router.get('/advanced', auth, async (req, res) => {
  const cacheKey = `stats:advanced:${req.user.id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const uid = req.user.id;

    // Stock par région (top 15)
    const [byRegion] = await db.query(
      `SELECT
         COALESCE(NULLIF(region,''), 'Inconnue') as region,
         SUM(quantity) as bottles,
         COUNT(*) as refs,
         SUM(COALESCE(price * quantity, 0)) as value
       FROM wines
       WHERE user_id = ? AND is_drunk = 0 AND quantity > 0
       GROUP BY region
       ORDER BY bottles DESC
       LIMIT 15`,
      [uid]
    );

    // Valeur par type
    const [byType] = await db.query(
      `SELECT type,
         SUM(quantity) as bottles,
         COUNT(*) as refs,
         SUM(COALESCE(price * quantity, 0)) as value
       FROM wines
       WHERE user_id = ? AND is_drunk = 0 AND quantity > 0
       GROUP BY type
       ORDER BY bottles DESC`,
      [uid]
    );

    // Top pays
    const [byCountry] = await db.query(
      `SELECT
         COALESCE(NULLIF(country,''), 'Inconnu') as country,
         SUM(quantity) as bottles
       FROM wines
       WHERE user_id = ? AND is_drunk = 0 AND quantity > 0
       GROUP BY country
       ORDER BY bottles DESC
       LIMIT 10`,
      [uid]
    );

    // Rotation annuelle — vins ajoutés par année (based on created_at)
    const [addedByYear] = await db.query(
      `SELECT YEAR(created_at) as year, COUNT(*) as refs, SUM(quantity) as bottles
       FROM wines WHERE user_id = ?
       GROUP BY YEAR(created_at)
       ORDER BY year ASC`,
      [uid]
    );

    // Rotation annuelle — vins bus par année (based on updated_at when is_drunk=1)
    const [drunkByYear] = await db.query(
      `SELECT YEAR(updated_at) as year, COUNT(*) as consumed
       FROM wines WHERE user_id = ? AND (is_drunk = 1 OR quantity = 0)
       GROUP BY YEAR(updated_at)
       ORDER BY year ASC`,
      [uid]
    );

    // Merge rotation
    const yearsSet = new Set([
      ...addedByYear.map(r => r.year),
      ...drunkByYear.map(r => r.year),
    ]);
    const addedMap  = Object.fromEntries(addedByYear.map(r => [r.year, r]));
    const drunkMap  = Object.fromEntries(drunkByYear.map(r => [r.year, r.consumed]));
    const rotation  = [...yearsSet].sort().map(y => ({
      year:     y,
      added:    addedMap[y]?.refs || 0,
      bottles:  addedMap[y]?.bottles || 0,
      consumed: drunkMap[y] || 0,
    }));

    // Valeur totale + répartition
    const [[summary]] = await db.query(
      `SELECT
         SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN COALESCE(price*quantity,0) ELSE 0 END) as total_value,
         SUM(CASE WHEN is_drunk=0 AND quantity>0 THEN quantity ELSE 0 END) as total_bottles,
         COUNT(DISTINCT CASE WHEN is_drunk=0 AND quantity>0 THEN region END) as regions_count,
         COUNT(DISTINCT CASE WHEN is_drunk=0 AND quantity>0 THEN country END) as countries_count
       FROM wines WHERE user_id = ?`,
      [uid]
    );

    // Peak timeline — vins avec keep_until groupés par année (fenêtre ±8 ans)
    const nowYear = new Date().getFullYear();
    const [peakRows] = await db.query(
      `SELECT keep_until as year, type, COUNT(*) as refs, SUM(quantity) as bottles,
              GROUP_CONCAT(name ORDER BY name SEPARATOR '||' LIMIT 5) as sample_names
       FROM wines
       WHERE user_id = ? AND is_drunk=0 AND quantity>0 AND keep_until IS NOT NULL
         AND keep_until BETWEEN ? AND ?
       GROUP BY keep_until, type
       ORDER BY keep_until ASC`,
      [uid, nowYear - 2, nowYear + 8]
    );
    // Flatten into per-year entries with type breakdown
    const peakByYear = {};
    for (const r of peakRows) {
      if (!peakByYear[r.year]) peakByYear[r.year] = { year: r.year, total: 0, byType: {}, sample: [] };
      peakByYear[r.year].byType[r.type] = (peakByYear[r.year].byType[r.type] || 0) + parseInt(r.bottles);
      peakByYear[r.year].total += parseInt(r.bottles);
      peakByYear[r.year].sample.push(...(r.sample_names || '').split('||').filter(Boolean));
    }
    const peak_timeline = Object.values(peakByYear).sort((a, b) => a.year - b.year);

    const result = { by_region: byRegion, by_type: byType, by_country: byCountry, rotation, summary, peak_timeline };
    await cacheSet(cacheKey, result, 120);
    res.json(result);
  } catch (err) {
    console.error('[stats/advanced]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
