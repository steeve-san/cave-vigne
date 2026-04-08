// src/services/wineScraper.js — fallback wine data scrapers
// Sources (in priority order): UPC ItemDB → Vivino → Oeni → Liv-ex
// All functions return null on failure (never throw).

const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
};
const TIMEOUT = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapVivinoType(typeId) {
  const map = { 1: 'rouge', 2: 'blanc', 3: 'rosé', 7: 'pétillant', 4: 'pétillant', 24: 'blanc' };
  return map[typeId] || 'rouge';
}

// ── 1. UPC ItemDB — EAN → product name/brand (free tier, ~100 req/day) ────────
async function upcItemDbLookup(ean) {
  try {
    const { data } = await axios.get('https://api.upcitemdb.com/prod/trial/lookup', {
      params: { upc: ean },
      headers: HEADERS,
      timeout: TIMEOUT,
    });
    const item = data?.items?.[0];
    if (!item) return null;
    return { name: item.title || null, producer: item.brand || null };
  } catch {
    return null;
  }
}

// ── 2. Vivino search — best structured wine data ───────────────────────────────
async function vivinoSearch(query) {
  try {
    const { data } = await axios.get('https://www.vivino.com/api/explore/explore', {
      params: {
        q: query,
        language: 'fr',
        country_code: 'fr',
        min_rating: 1,
        order_by: 'ratings_count',
        order: 'desc',
        per_page: 3,
      },
      headers: {
        ...HEADERS,
        Accept: 'application/json',
        Referer: 'https://www.vivino.com/search/wines?q=' + encodeURIComponent(query),
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: TIMEOUT,
    });

    const matches = data?.explore_vintage?.matches;
    if (!matches?.length) return null;

    const m = matches[0];
    const vintage = m.vintage;
    const wine = vintage?.wine;
    const winery = wine?.winery;

    return {
      name:     wine?.name || null,
      producer: winery?.name || null,
      vintage:  vintage?.year || null,
      type:     mapVivinoType(wine?.type_id),
      region:   wine?.region?.name || null,
      country:  wine?.region?.country?.name || null,
      grapes:   (wine?.style?.grapes || []).map(g => g.name).join(', ') || null,
      notes:    wine?.style?.description || null,
      label_url: vintage?.image?.location ? `https:${vintage.image.location}` : null,
      source:   'vivino',
    };
  } catch {
    return null;
  }
}

// ── 3. Oeni — French wine app, try public search ──────────────────────────────
async function oeniSearch(query) {
  try {
    const { data } = await axios.get('https://oeni.com/fr/recherche', {
      params: { q: query },
      headers: { ...HEADERS, Accept: 'text/html' },
      timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    // Try common structured data first
    const jsonLd = $('script[type="application/ld+json"]').first().text();
    if (jsonLd) {
      const parsed = JSON.parse(jsonLd);
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (item?.name) {
        return {
          name:     item.name || null,
          producer: item.brand?.name || null,
          region:   item.additionalProperty?.find(p => p.name === 'region')?.value || null,
          source:   'oeni',
        };
      }
    }

    // Fallback: parse first search result card
    const card = $('.wine-card, [class*="product-item"], [class*="search-result"]').first();
    if (!card.length) return null;
    const name = card.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
    if (!name) return null;
    return { name, source: 'oeni' };
  } catch {
    return null;
  }
}

// ── 4. Liv-ex — investment-grade wines (Bordeaux, Bourgogne, etc.) ────────────
async function livexSearch(query) {
  try {
    const { data } = await axios.get('https://www.liv-ex.com/search-results/', {
      params: { q: query },
      headers: { ...HEADERS, Accept: 'text/html' },
      timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    // Try JSON-LD structured data
    const jsonLd = $('script[type="application/ld+json"]').first().text();
    if (jsonLd) {
      try {
        const parsed = JSON.parse(jsonLd);
        const items = parsed?.itemListElement || (Array.isArray(parsed) ? parsed : [parsed]);
        const first = items?.[0]?.item || items?.[0];
        if (first?.name) return { name: first.name, source: 'liv-ex' };
      } catch { /* invalid JSON-LD */ }
    }

    // Fallback: parse result listings
    const first = $('[class*="wine"], [class*="product"], .search-result').first();
    if (!first.length) return null;
    const name = first.find('h2, h3, [class*="name"], [class*="title"]').first().text().trim();
    if (!name) return null;
    return { name, source: 'liv-ex' };
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * EAN barcode → wine data.
 * Flow: UPC ItemDB (name) → Vivino (enrich) → Oeni → Liv-ex
 */
async function scrapeWineByEan(ean) {
  // Step 1: resolve EAN to product name
  const upc = await upcItemDbLookup(ean);
  if (!upc?.name) return null;

  // Step 2: enrich by name
  return scrapeWineByName(upc.name, upc.producer);
}

/**
 * Wine name → enriched wine data.
 * Tries Vivino first, then Oeni, then Liv-ex.
 */
async function scrapeWineByName(name, hint) {
  const query = [name, hint].filter(Boolean).join(' ').trim();

  const vivino = await vivinoSearch(query);
  if (vivino?.name) return vivino;

  const oeni = await oeniSearch(query);
  if (oeni?.name) return oeni;

  const livex = await livexSearch(query);
  if (livex?.name) return { ...livex, name: livex.name || name };

  return null;
}

module.exports = { scrapeWineByEan, scrapeWineByName, vivinoSearch };
