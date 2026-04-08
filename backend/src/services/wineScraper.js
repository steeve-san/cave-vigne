// src/services/wineScraper.js — fallback wine + beer data scrapers
// Wine sources: UPC ItemDB → Vivino → Oeni → Liv-ex
// Beer sources: UPC ItemDB → V&B → Untappd → RateBeer
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

// ═══════════════════════════════════════════════════════════════════════════════
// BEER SCRAPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Map beer type keywords → enum value ──────────────────────────────────────
function mapBeerType(text) {
  if (!text) return 'blonde';
  const t = text.toLowerCase();
  if (t.includes('ipa') && (t.includes('new') || t.includes('hazy') || t.includes('ne'))) return 'NEIPA';
  if (t.includes('ipa') || t.includes('india pale')) return 'IPA';
  if (t.includes('stout')) return 'stout';
  if (t.includes('porter')) return 'porter';
  if (t.includes('lager')) return 'lager';
  if (t.includes('pilsner') || t.includes('pils')) return 'pilsner';
  if (t.includes('triple') || t.includes('tripel')) return 'triple';
  if (t.includes('quadruple') || t.includes('quad')) return 'quadruple';
  if (t.includes('sour') || t.includes('gose') || t.includes('gueuze') || t.includes('kriek')) return 'sour';
  if (t.includes('lambic')) return 'lambic';
  if (t.includes('saison') || t.includes('farmhouse')) return 'saison';
  if (t.includes('blanche') || t.includes('weiss') || t.includes('wit') || t.includes('wheat')) return 'blanche';
  if (t.includes('ambrée') || t.includes('ambree') || t.includes('amber') || t.includes('red ale') || t.includes('rouge')) return 'ambrée';
  if (t.includes('brune') || t.includes('brown') || t.includes('dark') || t.includes('dunkel')) return 'brune';
  if (t.includes('blonde') || t.includes('pale ale') || t.includes('golden')) return 'blonde';
  return 'blonde';
}

// ── 5. V&B (Vins & Bières) — French specialist beer retailer ─────────────────
async function vAndBSearch(query) {
  try {
    // V&B search endpoint
    const { data } = await axios.get('https://www.vandb.fr/search', {
      params: { q: query },
      headers: { ...HEADERS, Accept: 'text/html' },
      timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    // Try JSON-LD first (Product schema)
    let result = null;
    $('script[type="application/ld+json"]').each((_i, el) => {
      if (result) return;
      try {
        const parsed = JSON.parse($(el).text());
        const items = parsed?.itemListElement || (Array.isArray(parsed) ? parsed : [parsed]);
        const first = items?.[0]?.item || items?.[0];
        if (first?.['@type'] === 'Product' && first?.name) {
          result = {
            name:     first.name,
            brewery:  first.brand?.name || null,
            notes:    first.description || null,
            label_url: first.image || null,
            source:   'vandb',
          };
        }
      } catch { /* skip */ }
    });
    if (result) return result;

    // Fallback: parse product grid
    const card = $('.product-item, [class*="product_item"], [class*="product-card"], article.product').first();
    if (!card.length) return null;

    const name    = card.find('[class*="product-name"], [class*="product_name"], h2, h3').first().text().trim();
    const brewery = card.find('[class*="brand"], [class*="producer"], [class*="brewery"]').first().text().trim();
    const abvText = card.find('[class*="abv"], [class*="degre"], [class*="alcohol"]').first().text().trim();
    const abv     = abvText ? parseFloat(abvText.replace(',', '.')) : null;
    const imgSrc  = card.find('img').first().attr('src') || null;

    if (!name) return null;
    return {
      name,
      brewery:   brewery || null,
      abv:       abv || null,
      label_url: imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.vandb.fr${imgSrc}`) : null,
      source:    'vandb',
    };
  } catch {
    return null;
  }
}

// ── 6. Untappd — world's largest beer database (public search) ───────────────
async function untappdSearch(query) {
  try {
    // Untappd has a public search endpoint used by their own web app
    const { data } = await axios.get('https://untappd.com/search', {
      params: { q: query, type: 'beer' },
      headers: {
        ...HEADERS,
        Accept: 'text/html',
        Referer: 'https://untappd.com/',
      },
      timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    // Each result: .beer-item
    const first = $('.beer-item, [class*="beer_item"]').first();
    if (!first.length) return null;

    const name    = first.find('.beer-name, [class*="beer_name"], h1, h2').first().text().trim();
    const brewery = first.find('.brewery, [class*="brewery"], .brewer').first().text().trim();
    const style   = first.find('.style, [class*="style"], [class*="type"]').first().text().trim();
    const abvText = first.find('[class*="abv"]').first().text().trim();
    const abv     = abvText ? parseFloat(abvText.replace(',', '.').replace(/[^\d.]/g, '')) : null;
    const imgSrc  = first.find('img.label, img.beer-label, img[class*="label"]').first().attr('src') || null;

    if (!name) return null;
    return {
      name,
      brewery:   brewery || null,
      type:      mapBeerType(style),
      abv:       (!isNaN(abv) && abv > 0) ? abv : null,
      notes:     style || null,
      label_url: imgSrc || null,
      source:    'untappd',
    };
  } catch {
    return null;
  }
}

// ── 7. RateBeer — fallback beer reference ────────────────────────────────────
async function rateBeerSearch(query) {
  try {
    const { data } = await axios.get('https://www.ratebeer.com/search/', {
      params: { beername: query },
      headers: { ...HEADERS, Accept: 'text/html' },
      timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    // Try JSON-LD
    const jsonLd = $('script[type="application/ld+json"]').first().text();
    if (jsonLd) {
      try {
        const parsed = JSON.parse(jsonLd);
        const item = Array.isArray(parsed) ? parsed[0] : parsed;
        if (item?.name) {
          return {
            name:     item.name,
            brewery:  item.brand?.name || null,
            notes:    item.description || null,
            label_url: item.image || null,
            source:   'ratebeer',
          };
        }
      } catch { /* skip */ }
    }

    const first = $('[class*="beer"], .search-result, [data-type="beer"]').first();
    if (!first.length) return null;
    const name = first.find('a, h3, h2').first().text().trim();
    if (!name) return null;
    return { name, source: 'ratebeer' };
  } catch {
    return null;
  }
}

// ── Public API — Beer ──────────────────────────────────────────────────────────

/**
 * EAN → beer data.
 * Flow: UPC ItemDB (name) → V&B → Untappd → RateBeer
 */
async function scrapeBeerByEan(ean) {
  const upc = await upcItemDbLookup(ean);
  if (!upc?.name) return null;
  return scrapeBeerByName(upc.name, upc.producer);
}

/**
 * Beer name → enriched beer data.
 * Tries V&B first (French context), then Untappd, then RateBeer.
 */
async function scrapeBeerByName(name, hint) {
  const query = [name, hint].filter(Boolean).join(' ').trim();

  const vandb = await vAndBSearch(query);
  if (vandb?.name) return vandb;

  const untappd = await untappdSearch(query);
  if (untappd?.name) return untappd;

  const ratebeer = await rateBeerSearch(query);
  if (ratebeer?.name) return { ...ratebeer, name: ratebeer.name || name };

  return null;
}

module.exports = { scrapeWineByEan, scrapeWineByName, vivinoSearch, scrapeBeerByEan, scrapeBeerByName, mapBeerType };
