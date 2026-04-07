// src/routes/sommelier.js
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { cacheGet, cacheSet } = require('../config/redis');
const multer = require('multer');
const sharp = require('sharp');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10485760 } });

async function callClaude(messages, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages })
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.map(c => c.text || '').join('') || '';
}

// POST /api/sommelier/accord — accord mets/vins depuis cave
router.post('/accord', auth, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ error: 'Clé API Anthropic non configurée — ajoute ANTHROPIC_API_KEY dans le .env et redémarre l\'API.' });
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'Requête manquante' });

  const cacheKey = `sommelier:${req.user.id}:${Buffer.from(query).toString('base64').slice(0,40)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [wines] = await db.query(
      'SELECT name, type, vintage, appellation, grapes, region, quantity FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const [spirits] = await db.query(
      "SELECT name, type, origin, age, abv FROM spirits WHERE user_id=? AND status!='empty' ORDER BY created_at DESC LIMIT 30",
      [req.user.id]
    );

    const caveList = wines.map(w => `- ${w.name} (${w.type}, ${w.vintage||'NV'}, ${w.grapes||''}, ${w.region||''}) ×${w.quantity}`).join('\n');
    const spiritList = spirits.map(s => `- ${s.name} (${s.type}, ${s.origin||''}, ${s.age||''})`).join('\n');

    const prompt = `Tu es un sommelier expert et passionné. Cave disponible:
VINS: ${caveList || '(vide)'}
SPIRITUEUX: ${spiritList || '(vide)'}

Demande: "${query}"

Réponds UNIQUEMENT en JSON valide sans markdown:
{"plat_interprete":"...","explication":"2 phrases passionnées","cave_matches":[{"name":"nom exact","score":5,"accord":"rouge|blanc|rosé|pétillant|whisky|cognac|autre","why":"explication précise"}],"recommendations_generales":[{"type":"...","appellation":"...","cepage":"...","why":"..."}],"conseil_temperature":"...","conseil_service":"..."}
Priorité absolue aux bouteilles en cave. Score 1-5.`;

    const text = await callClaude([{ role: 'user', content: prompt }]);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { plat_interprete: query, explication: 'Voici mes suggestions.', cave_matches: [], recommendations_generales: [] }; }

    await db.query('INSERT INTO sommelier_sessions (user_id, query, result) VALUES (?,?,?)', [req.user.id, query, JSON.stringify(result)]);
    await cacheSet(cacheKey, result, 1800);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur service IA' }); }
});

// POST /api/sommelier/scan — analyse étiquette par image
router.post('/scan', auth, upload.single('label'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ error: 'Clé API Anthropic non configurée.' });
  if (!req.file) return res.status(400).json({ error: 'Image manquante' });
  try {
    const webp = await sharp(req.file.buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    const base64 = webp.toString('base64');

    const text = await callClaude([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: base64 } },
        { type: 'text', text: `Analyse cette étiquette de vin et extrais les informations. Réponds UNIQUEMENT en JSON valide sans backticks:
{"name":"nom du vin","appellation":"appellation AOC","vintage":annee_ou_null,"type":"rouge|blanc|rosé|pétillant","producer":"producteur","region":"région","country":"pays","grapes":"cépages","notes":"description courte","confidence":"high|medium|low"}
Si ce n'est pas une étiquette de vin: {"error":"not_wine"}` }
      ]
    }], 800);

    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { error: 'parse_error' }; }

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur analyse' }); }
});

// GET /api/sommelier/history
router.get('/history', auth, async (req, res) => {
  const [rows] = await db.query('SELECT id, query, result, created_at FROM sommelier_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
  res.json(rows);
});

module.exports = router;
