// src/routes/sommelier.js
const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { cacheGet, cacheSet } = require('../config/redis');
const { callAI, callAIVision, checkAIAvailable } = require('../config/ai');
const multer = require('multer');
const sharp = require('sharp');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10485760 } });

// POST /api/sommelier/accord — food/wine pairing from cellar
router.post('/accord', auth, async (req, res) => {
  const { ok, provider, error } = await checkAIAvailable();
  if (!ok) return res.status(503).json({ error: error || 'Fournisseur IA non configuré' });

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

    const caveList  = wines.map(w => `- ${w.name} (${w.type}, ${w.vintage||'NV'}, ${w.grapes||''}, ${w.region||''}) ×${w.quantity}`).join('\n');
    const spiritList = spirits.map(s => `- ${s.name} (${s.type}, ${s.origin||''}, ${s.age||''})`).join('\n');

    const prompt = `Tu es un sommelier expert et passionné. Cave disponible:
VINS: ${caveList || '(vide)'}
SPIRITUEUX: ${spiritList || '(vide)'}

Demande: "${query}"

Réponds UNIQUEMENT en JSON valide sans markdown:
{"plat_interprete":"...","explication":"2 phrases passionnées","cave_matches":[{"name":"nom exact","score":5,"accord":"rouge|blanc|rosé|pétillant|whisky|cognac|autre","why":"explication précise"}],"recommendations_generales":[{"type":"...","appellation":"...","cepage":"...","why":"..."}],"conseil_temperature":"...","conseil_service":"..."}
Priorité absolue aux bouteilles en cave. Score 1-5.`;

    const text = await callAI([{ role: 'user', content: prompt }]);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { plat_interprete: query, explication: 'Voici mes suggestions.', cave_matches: [], recommendations_generales: [] }; }

    result._provider = provider;
    await db.query('INSERT INTO sommelier_sessions (user_id, query, result) VALUES (?,?,?)', [req.user.id, query, JSON.stringify(result)]);
    await cacheSet(cacheKey, result, 1800);
    res.json(result);
  } catch (err) {
    console.error('[accord] error:', err);
    res.status(500).json({ error: err.message || 'Erreur service IA' });
  }
});

// POST /api/sommelier/scan — analyse wine label from image
router.post('/scan', auth, upload.single('label'), async (req, res) => {
  const { ok, provider, error } = await checkAIAvailable();
  if (!ok) return res.status(503).json({ error: error || 'Fournisseur IA non configuré' });
  if (!req.file) return res.status(400).json({ error: 'Image manquante' });

  try {
    const webp = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const base64 = webp.toString('base64');

    const textPrompt = `Analyse cette étiquette de vin et extrais les informations. Réponds UNIQUEMENT en JSON valide sans backticks:
{"name":"nom du vin","appellation":"appellation AOC","vintage":annee_ou_null,"type":"rouge|blanc|rosé|pétillant","producer":"producteur","region":"région","country":"pays","grapes":"cépages","notes":"description courte","confidence":"high|medium|low"}
Si ce n'est pas une étiquette de vin: {"error":"not_wine"}`;

    const text = await callAIVision(base64, 'image/webp', textPrompt, 800);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { error: 'parse_error' }; }

    result._provider = provider;
    res.json(result);
  } catch (err) {
    console.error('[scan] error:', err);
    const msg = err.message || 'Erreur analyse';
    const hint = msg.includes('sharp') || msg.includes('native') ? ' (essaie: cd backend && npm rebuild sharp)' : '';
    res.status(500).json({ error: `Erreur analyse: ${msg}${hint}` });
  }
});

// POST /api/sommelier/analyse — AI cave analysis report
router.post('/analyse', auth, async (req, res) => {
  const { ok, provider, error } = await checkAIAvailable();
  if (!ok) return res.status(503).json({ error: error || 'Fournisseur IA non configuré' });

  try {
    const [wines] = await db.query(
      `SELECT name, type, vintage, appellation, grapes, region, country, quantity, price, keep_until
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const [spirits] = await db.query(
      `SELECT name, type, origin, age, abv, rating FROM spirits WHERE user_id=? AND status!='empty'`,
      [req.user.id]
    );
    const [[stats]] = await db.query(
      `SELECT COUNT(*) as refs, SUM(quantity) as bottles,
              COUNT(DISTINCT country) as countries,
              SUM(COALESCE(price*quantity,0)) as value
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0`,
      [req.user.id]
    );

    const caveList = wines.map(w =>
      `- ${w.name} (${w.type}, ${w.vintage||'NV'}, ${w.region||w.country||''}) ×${w.quantity}${w.keep_until ? ` [boire avant ${w.keep_until}]` : ''}`
    ).join('\n');

    const prompt = `Tu es un expert en oenologie. Analyse cette cave privée et génère un rapport détaillé.

STATISTIQUES: ${stats.refs} références, ${stats.bottles} bouteilles, ${stats.countries} pays, valeur ~${Math.round(stats.value || 0)}€
VINS EN CAVE:
${caveList || '(vide)'}
SPIRITUEUX: ${spirits.length} bouteilles

Génère un rapport JSON:
{
  "score_diversite": 1-10,
  "score_equilibre": 1-10,
  "points_forts": ["..."],
  "axes_amelioration": ["..."],
  "a_deguster_maintenant": ["nom de vin à boire prochainement"],
  "a_garder": ["nom de vin à garder"],
  "manques_notables": ["types/régions absents"],
  "conseil_principal": "conseil personnalisé en 2-3 phrases",
  "occasion_parfaite": {"occasion": "...", "vin": "nom depuis la cave", "pourquoi": "..."}
}`;

    const text = await callAI([{ role: 'user', content: prompt }], 1200);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { conseil_principal: text, points_forts: [], axes_amelioration: [] }; }

    res.json({ ...result, stats, _provider: provider });
  } catch (err) {
    console.error('[analyse] error:', err);
    res.status(500).json({ error: err.message || 'Erreur analyse' });
  }
});

// GET /api/sommelier/history
router.get('/history', auth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, query, result, created_at FROM sommelier_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/sommelier/recipes?food=NAME — recipe suggestions from TheMealDB (free, no key required)
router.get('/recipes', auth, async (req, res) => {
  const { food } = req.query;
  if (!food) return res.status(400).json({ error: 'Paramètre food requis' });
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(food)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = response.ok ? await response.json() : { meals: null };
    const meals = (data.meals || []).slice(0, 6).map(m => ({
      id:           m.idMeal,
      name:         m.strMeal,
      category:     m.strCategory,
      area:         m.strArea,
      instructions: m.strInstructions?.slice(0, 300) + '…',
      image:        m.strMealThumb,
      youtube:      m.strYoutube,
      source:       m.strSource,
    }));
    res.json({ meals, total: meals.length });
  } catch (err) {
    res.json({ meals: [], total: 0, error: err.message });
  }
});

// POST /api/sommelier/recommend — "what to open tonight?"
router.post('/recommend', auth, async (req, res) => {
  const { ok, provider, error } = await checkAIAvailable();
  if (!ok) return res.status(503).json({ error: error || 'Fournisseur IA non configuré' });

  const { occasion, guests, mood } = req.body;
  try {
    const [wines] = await db.query(
      `SELECT name, type, vintage, appellation, grapes, region, country, keep_until
       FROM wines WHERE user_id=? AND is_drunk=0 AND quantity>0 ORDER BY RAND() LIMIT 40`,
      [req.user.id]
    );
    if (!wines.length) return res.status(404).json({ error: 'Cave vide' });

    const now = new Date().getFullYear();
    const caveList = wines.map(w =>
      `- ${w.name} (${w.type}, ${w.vintage || 'NV'}, ${w.region || w.country || ''})${w.keep_until && w.keep_until <= now + 1 ? ' [À BOIRE BIENTÔT]' : ''}`
    ).join('\n');

    const ctx = [
      occasion ? `Occasion: ${occasion}` : '',
      guests   ? `Convives: ${guests}`   : '',
      mood     ? `Envie: ${mood}`        : '',
    ].filter(Boolean).join(', ');

    const prompt = `Tu es un sommelier passionné. Aide-moi à choisir quoi ouvrir ce soir.
${ctx ? `Contexte: ${ctx}\n` : ''}Cave disponible:\n${caveList}

Réponds UNIQUEMENT en JSON valide:
{"recommendation":{"name":"nom exact du vin en cave","type":"rouge|blanc|rosé|pétillant","why":"explication enthousiaste 2-3 phrases","temp":"température de service idéale","decant":"oui|non|recommandé","food":"suggestion d'accord mets/vin"},"alternatives":[{"name":"...","why":"..."}],"conseil_ambiance":"conseil court pour la soirée"}`;

    const text = await callAI([{ role: 'user', content: prompt }], 700);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { recommendation: { name: '', why: text }, alternatives: [] }; }
    result._provider = provider;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur IA' });
  }
});

// POST /api/sommelier/region-spotlight — AI summary of a wine region + your wines in it
router.post('/region-spotlight', auth, async (req, res) => {
  const { ok, provider, error } = await checkAIAvailable();
  if (!ok) return res.status(503).json({ error: error || 'Fournisseur IA non configuré' });

  const { region } = req.body;
  if (!region) return res.status(400).json({ error: 'Région requise' });

  try {
    const [wines] = await db.query(
      `SELECT name, vintage, appellation, grapes, quantity FROM wines
       WHERE user_id=? AND is_drunk=0 AND quantity>0
         AND (region LIKE ? OR appellation LIKE ?)
       ORDER BY vintage DESC LIMIT 20`,
      [req.user.id, `%${region}%`, `%${region}%`]
    );

    const wineList = wines.map(w =>
      `- ${w.name}${w.vintage ? ` ${w.vintage}` : ''}${w.appellation ? `, ${w.appellation}` : ''} ×${w.quantity}`
    ).join('\n');

    const prompt = `Tu es un expert en oenologie. Fais un portrait concis de la région viticole "${region}" (France).
${wines.length ? `\nVins de cette région en cave de l'utilisateur:\n${wineList}` : ''}

Réponds en JSON:
{"region":"${region}","description":"présentation enthousiaste en 3-4 phrases (terroir, cépages typiques, styles)","cepages_emblematiques":["..."],"appellations_phares":["..."],"garde_typique":"ex: 5-15 ans pour les rouges","accord_ideal":"accord mets/vins emblématique","anecdote":"fait historique ou curiosité en 1 phrase"}`;

    const text = await callAI([{ role: 'user', content: prompt }], 600);
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { result = { region, description: text }; }
    result._provider = provider;
    result.cave_wines = wines;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur IA' });
  }
});

// GET /api/sommelier/providers — list available providers and current config
router.get('/providers', auth, async (req, res) => {
  const { getAIConfig } = require('../config/ai');
  try {
    const cfg = await getAIConfig();
    const provider = cfg.ai_provider || 'anthropic';
    const providers = [
      { id: 'anthropic', name: 'Claude (Anthropic)', configured: !!(process.env.ANTHROPIC_API_KEY || cfg.anthropic_key) },
      { id: 'openai',    name: 'ChatGPT (OpenAI)',   configured: !!(process.env.OPENAI_API_KEY    || cfg.openai_key) },
      { id: 'mistral',   name: 'Mistral AI',         configured: !!(process.env.MISTRAL_API_KEY   || cfg.mistral_key) },
      { id: 'openwebui', name: 'OpenWebUI / Ollama', configured: !!(cfg.openwebui_url) },
    ];
    res.json({ current: provider, providers });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
