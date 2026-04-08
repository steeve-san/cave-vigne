// src/jobs/importOpenFoodFacts.js
// ─────────────────────────────────────────────────────────────────────────────
// Imports Open Food Facts wine data into the local barcode_cache table.
//
// Usage:
//   node src/jobs/importOpenFoodFacts.js              # full import (JSONL dump)
//   node src/jobs/importOpenFoodFacts.js --ean 3760026350023  # single EAN lookup
//
// The JSONL dump (≈3 GB) is downloaded once to UPLOAD_DIR/off_dump.jsonl.
// Subsequent runs skip the download unless --refresh flag is passed.
// Only wine-category products are kept (category tags contain "wine").
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const http  = require('https');
const readline = require('readline');
const mysql = require('mysql2/promise');
const zlib  = require('zlib');

const DUMP_URL  = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const DUMP_PATH  = path.join(UPLOAD_DIR, 'off_dump.jsonl.gz');
const BATCH_SIZE = 500; // rows per DB insert batch

// ── DB connection ─────────────────────────────────────────────────────────────
async function getConn() {
  return mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'cave_vigne',
  });
}

// ── Download dump ─────────────────────────────────────────────────────────────
function downloadDump() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('[OFF] Téléchargement dump Open Food Facts…');
    const file = fs.createWriteStream(DUMP_PATH + '.tmp');
    http.get(DUMP_URL, { timeout: 300_000 }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let done = 0;
      res.on('data', chunk => {
        done += chunk.length;
        if (total) process.stdout.write(`\r[OFF] ${(done / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MB`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); fs.renameSync(DUMP_PATH + '.tmp', DUMP_PATH); console.log('\n[OFF] Dump téléchargé.'); resolve(); });
    }).on('error', reject);
  });
}

// ── Parse product → cache row ──────────────────────────────────────────────────
function parseProduct(p) {
  const cats = (p.categories_tags || []).join(' ').toLowerCase();
  const isWine = cats.includes('wine') || cats.includes('vin') || cats.includes('fr:vins');
  if (!isWine) return null;

  const ean = p.code;
  if (!ean || !/^\d{8,14}$/.test(ean)) return null;

  const name    = (p.product_name_fr || p.product_name || '').trim();
  const producer = (p.brands || '').trim();
  if (!name && !producer) return null;

  // Try to extract vintage from name
  const vintageMatch = name.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const vintage = vintageMatch ? parseInt(vintageMatch[1]) : null;

  // Wine type from categories
  let type = 'rouge';
  if (cats.includes('blanc') || cats.includes('white')) type = 'blanc';
  else if (cats.includes('rosé') || cats.includes('rose')) type = 'rosé';
  else if (cats.includes('pétillant') || cats.includes('sparkling') || cats.includes('champagne') || cats.includes('crémant')) type = 'pétillant';

  return {
    ean,
    name:      name || null,
    producer:  producer || null,
    vintage,
    type,
    region:   (p.origins || '').trim() || null,
    country:  ((p.countries_tags?.[0] || '').replace(/^[a-z]{2}:/, '') || 'France').trim() || null,
    grapes:   (p.ingredients_text_fr || p.ingredients_text || '').substring(0, 500).trim() || null,
    notes:    (p.generic_name_fr || p.generic_name || '').substring(0, 500).trim() || null,
    label_url: p.image_front_url || p.image_url || null,
    source:   'off',
  };
}

// ── Upsert batch ──────────────────────────────────────────────────────────────
async function upsertBatch(conn, rows) {
  if (!rows.length) return;
  const cols = ['ean','name','producer','vintage','type','region','country','grapes','notes','label_url','source'];
  const placeholders = rows.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
  const values = rows.flatMap(r => cols.map(c => r[c] ?? null));
  await conn.query(
    `INSERT INTO barcode_cache (${cols.join(',')}) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), producer=VALUES(producer), vintage=VALUES(vintage),
       type=VALUES(type), region=VALUES(region), country=VALUES(country),
       grapes=VALUES(grapes), notes=VALUES(notes), label_url=VALUES(label_url),
       source=VALUES(source), updated_at=NOW()`,
    values
  );
}

// ── Single EAN from OFF API ───────────────────────────────────────────────────
async function importSingleEan(ean) {
  console.log(`[OFF] Lookup EAN ${ean}…`);
  const https = require('https');
  const data = await new Promise((resolve, reject) => {
    https.get(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`, { timeout: 8000 }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  if (data.status !== 1) { console.log('[OFF] Produit introuvable'); return; }
  const row = parseProduct(data.product ? { ...data.product, code: ean } : {});
  if (!row) { console.log('[OFF] Produit ignoré (non vin ou données manquantes)'); return; }
  const conn = await getConn();
  await upsertBatch(conn, [row]);
  await conn.end();
  console.log(`[OFF] Importé : ${row.name || row.producer} (${ean})`);
}

// ── Full dump import ──────────────────────────────────────────────────────────
async function importFull(opts = {}) {
  if (!fs.existsSync(DUMP_PATH) || opts.refresh) await downloadDump();

  const conn = await getConn();
  let total = 0, wines = 0, batch = [];

  console.log('[OFF] Lecture du dump…');
  const gunzip = zlib.createGunzip();
  const fileStream = fs.createReadStream(DUMP_PATH);
  const rl = readline.createInterface({ input: fileStream.pipe(gunzip), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    if (total % 100_000 === 0) process.stdout.write(`\r[OFF] Lignes: ${total}, vins: ${wines}`);

    let p;
    try { p = JSON.parse(line); } catch { continue; }
    const row = parseProduct(p);
    if (!row) continue;

    wines++;
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(conn, batch);
      batch = [];
    }
  }

  if (batch.length) await upsertBatch(conn, batch);
  await conn.end();
  console.log(`\n[OFF] Import terminé : ${wines} vins sur ${total} produits`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const eanArg = args[args.indexOf('--ean') + 1];
const refresh = args.includes('--refresh');

if (eanArg) {
  importSingleEan(eanArg).catch(e => { console.error(e.message); process.exit(1); });
} else {
  importFull({ refresh }).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { parseProduct, importSingleEan };
