// src/services/wineScraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Wine & beer data scrapers — enrichment + price lookup
//
// Wine enrichment sources:
//   1. UPC ItemDB        — EAN → product name (free API)
//   2. Vivino            — best structured wine data (JSON API)
//   3. Open Food Facts   — full product fields (free open API)
//   4. Wine-Searcher     — ratings + average price (HTML scrape)
//   5. Oeni              — French wine app (HTML scrape fallback)
//   6. Liv-ex            — investment-grade wines (HTML scrape fallback)
//
// Wine price sources (used by /market route):
//   7. Vivino            — median price + ratings count
//   8. Wine-Searcher     — min/max/avg price
//   9. Vinatis           — French retailer
//  10. Millésima         — French premium merchant
//  11. Nicolas           — French mass-market retailer
//  12. ChateauOnline     — French premium shop
//  13. iDéalwine         — French auction house
//
// Beer enrichment sources:
//  14. UPC ItemDB        — EAN → name
//  15. Open Food Facts   — beer product data
//  16. V&B              — French beer specialist
//  17. Untappd           — world beer database
//  18. RateBeer          — beer ratings fallback
//
// All functions return null (or []) on failure — never throw.
// ─────────────────────────────────────────────────────────────────────────────

const axios   = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
};
const TIMEOUT = 9000;

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Parse all JSON-LD blocks from a cheerio document */
function extractAllJsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try { out.push(JSON.parse($(el).text())); } catch { /* skip malformed */ }
  });
  return out;
}

/** Extract Next.js __NEXT_DATA__ embedded JSON from a cheerio document */
function extractNextData($) {
  try {
    const txt = $('#__NEXT_DATA__').text();
    return txt ? JSON.parse(txt) : null;
  } catch { return null; }
}

/**
 * Relevance score between a result name and the original wine name query.
 * Returns 0.0–1.0. Ignores vintage years and short stop-words.
 * Used to filter out completely unrelated OFf/scraper results.
 */
function scoreRelevance(resultName, wineName) {
  if (!resultName || !wineName) return 0;
  const stop = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'et', 'en', 'au', 'un', 'une', 'sur', 'the', 'of', 'and']);
  const words = wineName.toLowerCase()
    .split(/[\s\-_,]+/)
    .filter(w => w.length > 2 && !/^\d{4}$/.test(w) && !stop.has(w));
  if (!words.length) return 1; // nothing meaningful to compare
  const r = resultName.toLowerCase();
  const hits = words.filter(w => r.includes(w)).length;
  return hits / words.length;
}

/** Parse a price string like "24,90 €" or "$18.50" → float */
function parsePrice(str = '') {
  if (!str) return null;
  const m = str.match(/[\d]+[,.][\d]+/);
  if (!m) {
    const n = str.match(/[\d]+/);
    return n ? parseFloat(n[0]) : null;
  }
  return parseFloat(m[0].replace(',', '.'));
}

/** Map Vivino wine type_id → our enum */
function mapVivinoType(typeId) {
  return { 1: 'rouge', 2: 'blanc', 3: 'rosé', 7: 'pétillant', 4: 'pétillant', 24: 'blanc' }[typeId] || 'rouge';
}

/** Map Open Food Facts categories_tags → our type enum */
function mapOFFType(tags = []) {
  const t = tags.join(' ');
  if (/vins-rouges|red-wine|red-wines/.test(t))                                       return 'rouge';
  if (/vins-blancs|white-wine|white-wines/.test(t))                                    return 'blanc';
  if (/vins-ros|ros[eé]-wine/.test(t))                                                 return 'rosé';
  if (/effervescents|sparkling|champagnes|cremant|crémant|prosecco|cava/.test(t))      return 'pétillant';
  return null;
}

/** Extract certification labels from OFf labels_tags */
function mapOFFCerts(tags = []) {
  const t = tags.join(' ');
  const certs = [];
  if (/\baop\b|\baoc\b/.test(t))             certs.push('AOP/AOC');
  if (/\bigp\b/.test(t))                     certs.push('IGP');
  if (/biolog|organic/.test(t))              certs.push('Bio');
  if (/biodynami/.test(t))                   certs.push('Biodynamique');
  if (/vin-nature|vins-nature|nature/.test(t)) certs.push('Nature');
  if (/en:vegan/.test(t))                    certs.push('Vegan');
  if (/vin-de-france/.test(t))               certs.push('Vin de France');
  return certs.length ? certs.join(', ') : null;
}

/** Map beer-style text → beer type enum */
function mapBeerType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('ipa') && (t.includes('new') || t.includes('hazy') || t.includes('ne'))) return 'NEIPA';
  if (t.includes('ipa') || t.includes('india pale'))      return 'IPA';
  if (t.includes('stout'))                                 return 'stout';
  if (t.includes('porter'))                                return 'porter';
  if (t.includes('lager'))                                 return 'lager';
  if (t.includes('pilsner') || t.includes('pils'))         return 'pilsner';
  if (t.includes('triple') || t.includes('tripel'))        return 'triple';
  if (t.includes('quadruple') || t.includes('quad'))       return 'quadruple';
  if (t.includes('sour') || t.includes('gose') || t.includes('gueuze') || t.includes('kriek')) return 'sour';
  if (t.includes('lambic'))                                return 'lambic';
  if (t.includes('saison') || t.includes('farmhouse'))     return 'saison';
  if (t.includes('blanche') || t.includes('weiss') || t.includes('wit') || t.includes('wheat')) return 'blanche';
  if (t.includes('ambrée') || t.includes('amber') || t.includes('red ale')) return 'ambrée';
  if (t.includes('brune') || t.includes('brown') || t.includes('dark') || t.includes('dunkel')) return 'brune';
  return 'blonde';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. UPC ITEMDB — EAN → product name/brand
// ═══════════════════════════════════════════════════════════════════════════════
async function upcItemDbLookup(ean) {
  try {
    const { data } = await axios.get('https://api.upcitemdb.com/prod/trial/lookup', {
      params: { upc: ean }, headers: HEADERS, timeout: TIMEOUT,
    });
    const item = data?.items?.[0];
    if (!item) return null;
    return { name: item.title || null, producer: item.brand || null };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VIVINO — best structured wine data
// ═══════════════════════════════════════════════════════════════════════════════
async function vivinoSearch(query) {
  try {
    const { data } = await axios.get('https://www.vivino.com/api/explore/explore', {
      params: {
        q: query, language: 'fr', country_code: 'fr',
        min_rating: 1, order_by: 'ratings_count', order: 'desc', per_page: 5,
      },
      headers: {
        ...HEADERS,
        Accept: 'application/json',
        Referer: `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: TIMEOUT,
    });

    const matches = data?.explore_vintage?.matches;
    if (!matches?.length) return null;

    const m       = matches[0];
    const vintage = m.vintage;
    const wine    = vintage?.wine;
    const winery  = wine?.winery;
    const stats   = vintage?.statistics || {};
    const style   = wine?.style || {};
    const priceData = m.price || {};

    return {
      source:           'Vivino',
      name:             wine?.name || null,
      producer:         winery?.name || null,
      vintage:          vintage?.year || null,
      type:             mapVivinoType(wine?.type_id),
      region:           wine?.region?.name || null,
      country:          wine?.region?.country?.name || null,
      appellation:      wine?.appelation?.name || null,
      grapes:           (style?.grapes || []).map(g => g.name).join(', ') || null,
      food_pairings:    (style?.food || []).map(f => f.name).join(', ') || null,
      notes:            style?.description || null,
      flavor_profile:   (style?.flavor_group || []).map(f => f.primary_flavor).join(', ') || null,
      label_url:        vintage?.image?.location ? `https:${vintage.image.location}` : null,
      rating:           stats.wine_ratings_average ? parseFloat(stats.wine_ratings_average).toFixed(1) : null,
      ratings_count:    stats.ratings_count || null,
      price_avg:        priceData.amount ? parseFloat(priceData.amount) : (stats.median_price_rounded ? parseFloat(stats.median_price_rounded) : null),
      price_min:        stats.min_price ? parseFloat(stats.min_price) : null,
      price_max:        stats.max_price ? parseFloat(stats.max_price) : null,
      currency:         priceData.currency || 'EUR',
    };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. OPEN FOOD FACTS — full product data (free open API)
// ═══════════════════════════════════════════════════════════════════════════════

const OFF_FIELDS = [
  'code', 'product_name', 'abbreviated_product_name', 'generic_name',
  'brands', 'origins', 'origins_tags', 'countries', 'countries_tags',
  'categories', 'categories_tags', 'labels', 'labels_tags',
  'ingredients_text', 'image_url', 'image_front_url',
  'quantity', 'serving_size', 'alcohol_100g',
  'stores', 'manufacturing_places', 'purchase_places',
  'producer_product_id', 'product_quantity',
].join(',');

async function openFoodFactsSearch(query) {
  try {
    const { data } = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
      params: {
        search_terms:  query,
        tagtype_0:     'categories',
        tag_0:         'wines',
        action:        'process',
        json:          1,
        page_size:     6,
        fields:        OFF_FIELDS,
      },
      headers: { ...HEADERS, Accept: 'application/json' },
      timeout: TIMEOUT,
    });

    return (data.products || [])
      .filter(p => p.product_name && scoreRelevance(p.product_name, query) >= 0.3)
      .slice(0, 4)
      .map(p => _mapOFFProduct(p));
  } catch { return []; }
}

async function openFoodFactsByEan(ean) {
  try {
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/api/v2/product/${ean}`,
      { params: { fields: OFF_FIELDS }, headers: { ...HEADERS, Accept: 'application/json' }, timeout: TIMEOUT }
    );
    if (data.status !== 1 || !data.product) return null;
    return _mapOFFProduct(data.product);
  } catch { return null; }
}

function _mapOFFProduct(p) {
  // Resolve country: prefer origins field, then countries_tags
  const country = (p.origins || '').split(',')[0].trim() ||
    (p.countries_tags?.[0] || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' ') || null;

  // Resolve region from origins_tags (exclude language-prefixed tags like "en:france")
  const regionTags = (p.origins_tags || [])
    .filter(t => !/:/.test(t))
    .map(t => t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const region = regionTags.join(', ') || null;

  // Volume: extract numeric from quantity string (e.g. "75 cl" → 75)
  const volMatch = (p.quantity || '').match(/(\d+(?:[.,]\d+)?)\s*(?:cl|ml|l)/i);
  let volume = null;
  if (volMatch) {
    const v = parseFloat(volMatch[1].replace(',', '.'));
    const unit = volMatch[0].toLowerCase();
    volume = unit.includes('ml') ? v : unit.includes('cl') ? v * 10 : v * 1000; // normalise to ml
  }

  return {
    source:          'Open Food Facts',
    ean:             p.code || null,
    name:            p.product_name || p.abbreviated_product_name || null,
    generic_name:    p.generic_name || null,
    producer:        p.brands?.split(',')[0].trim() || null,
    country:         country || null,
    region:          region || null,
    type:            mapOFFType(p.categories_tags),
    grapes:          p.ingredients_text?.slice(0, 400) || null,
    abv:             p.alcohol_100g ? parseFloat(p.alcohol_100g) : null,
    certifications:  mapOFFCerts(p.labels_tags),
    label_image:     p.image_front_url || p.image_url || null,
    volume_ml:       volume,
    stores:          p.stores || null,
    manufacturing:   p.manufacturing_places || null,
    categories:      (p.categories_tags || [])
                       .filter(t => t.startsWith('fr:') || t.startsWith('en:'))
                       .map(t => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
                       .slice(0, 5)
                       .join(', ') || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WINE-SEARCHER — ratings + min/avg/max price
// ═══════════════════════════════════════════════════════════════════════════════
async function wineSearcherSearch(name, vintage) {
  try {
    const q    = [name, vintage].filter(Boolean).join(' ');
    const slug = q.replace(/\s+/g, '+');
    const url  = `https://www.wine-searcher.com/find/${slug}/1/france/-/-/-/list?Xcurrencycode=EUR`;
    const resp = await axios.get(url, {
      headers: { ...HEADERS, 'Accept-Encoding': 'gzip, deflate, br' },
      timeout: 10000,
    });
    const $ = cheerio.load(resp.data);

    // ── Try __NEXT_DATA__ first (most reliable) ─────────────────────────────
    const nd = extractNextData($);
    if (nd) {
      const pp       = nd?.props?.pageProps;
      // Wine-Searcher Next.js data paths (try several known structures)
      const wineNode = pp?.wineData?.wine || pp?.wine || pp?.data?.wine || pp?.initialData?.wine;
      const priceNode = pp?.wineData?.pricing || pp?.pricing || pp?.data?.pricing;

      if (wineNode?.name) {
        const grapeNames = (wineNode.grape_varieties || wineNode.grapes || [])
          .map(g => g.name || g).filter(Boolean).join(', ');
        return {
          source:         'Wine-Searcher',
          source_url:     `https://www.wine-searcher.com/find/${slug}`,
          name:           wineNode.name,
          vintage:        wineNode.year || wineNode.vintage || null,
          region:         wineNode.region?.name || wineNode.appellation?.name || null,
          country:        wineNode.region?.country?.name || wineNode.country?.name || null,
          grapes:         grapeNames || null,
          appellation:    wineNode.appellation?.name || null,
          rating:         wineNode.expert_ratings?.score || wineNode.pro_rating || null,
          community_rating: wineNode.community_ratings?.score || null,
          price_min:      priceNode?.minimum ? parseFloat(priceNode.minimum) : null,
          price_max:      priceNode?.maximum ? parseFloat(priceNode.maximum) : null,
          price_avg:      priceNode?.average ? parseFloat(priceNode.average) : null,
          currency:       'EUR',
          merchant_count: priceNode?.count || null,
        };
      }
    }

    // ── Fallback: JSON-LD Product ────────────────────────────────────────────
    for (const ld of extractAllJsonLd($)) {
      const product = ld?.['@type'] === 'Product' ? ld
        : ld?.itemListElement?.[0]?.item?.['@type'] === 'Product' ? ld.itemListElement[0].item
        : null;
      if (product?.name) {
        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        return {
          source:    'Wine-Searcher',
          source_url: `https://www.wine-searcher.com/find/${slug}`,
          name:      product.name,
          price_avg: offers?.price ? parseFloat(offers.price) : null,
          currency:  offers?.priceCurrency || 'EUR',
          rating:    product.aggregateRating?.ratingValue ? parseFloat(product.aggregateRating.ratingValue) : null,
        };
      }
    }

    // ── Fallback: meta tags ──────────────────────────────────────────────────
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const desc    = $('meta[name="description"], meta[property="og:description"]').first().attr('content') || '';
    const priceM  = desc.match(/(?:avg|average|prix moyen|price)[^€$\d]*([€$]?\s*\d+[.,]\d+)/i);
    const ratingM = desc.match(/(\d+(?:\.\d+)?)\s*(?:\/100|pts|points)/i);
    const price   = priceM ? parsePrice(priceM[1]) : null;

    if (!ogTitle && !price) return null;
    return {
      source:     'Wine-Searcher',
      source_url: `https://www.wine-searcher.com/find/${slug}`,
      name:       ogTitle || name,
      price_avg:  price,
      rating:     ratingM ? parseFloat(ratingM[1]) : null,
      currency:   'EUR',
    };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. OENI — French wine app (enrichment fallback)
// ═══════════════════════════════════════════════════════════════════════════════
async function oeniSearch(query) {
  try {
    const { data } = await axios.get('https://oeni.com/fr/recherche', {
      params: { q: query }, headers: HEADERS, timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    const jsonLd = $('script[type="application/ld+json"]').first().text();
    if (jsonLd) {
      const parsed = JSON.parse(jsonLd);
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (item?.name) return {
        source:  'Oeni',
        name:    item.name,
        producer: item.brand?.name || null,
        region:  item.additionalProperty?.find(p => p.name === 'region')?.value || null,
      };
    }

    const card = $('.wine-card, [class*="product-item"], [class*="search-result"]').first();
    if (!card.length) return null;
    const name = card.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
    return name ? { source: 'Oeni', name } : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. LIV-EX — investment-grade (enrichment fallback)
// ═══════════════════════════════════════════════════════════════════════════════
async function livexSearch(query) {
  try {
    const { data } = await axios.get('https://www.liv-ex.com/search-results/', {
      params: { q: query }, headers: HEADERS, timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);
    for (const ld of extractAllJsonLd($)) {
      const items = ld?.itemListElement || (Array.isArray(ld) ? ld : [ld]);
      const first = items?.[0]?.item || items?.[0];
      if (first?.name) return { source: 'Liv-ex', name: first.name };
    }
    const first = $('[class*="wine"], [class*="product"], .search-result').first();
    if (!first.length) return null;
    const name = first.find('h2, h3, [class*="name"]').first().text().trim();
    return name ? { source: 'Liv-ex', name } : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE SCRAPERS — used by /market route
// ═══════════════════════════════════════════════════════════════════════════════

// ── Vinatis — French online wine retailer ─────────────────────────────────────
async function vinatisScrape(query) {
  try {
    const url  = `https://www.vinatis.com/recherche?q=${encodeURIComponent(query)}`;
    const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
    const $    = cheerio.load(resp.data);

    // JSON-LD first
    for (const ld of extractAllJsonLd($)) {
      if (ld?.['@type'] === 'Product' && ld?.name) {
        const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
        return {
          source: 'Vinatis', source_url: url,
          name:         ld.name,
          price_avg:    offers?.price ? parseFloat(offers.price) : null,
          currency:     offers?.priceCurrency || 'EUR',
          availability: offers?.availability?.includes('InStock') ? 'En stock' : 'Voir le site',
          label_image:  ld.image || null,
        };
      }
    }

    // Fallback: CSS selectors — Vinatis uses React/Next.js, try typical patterns
    const selectors = [
      '[class*="product-card"]',
      '[class*="product-item"]',
      '.product-list__item',
      'article[class*="wine"]',
    ];
    let card = null;
    for (const sel of selectors) {
      card = $(sel).first();
      if (card.length) break;
    }
    if (!card?.length) return null;

    const name      = card.find('[class*="product-name"], [class*="wine-name"], h2, h3').first().text().trim();
    const priceText = card.find('[class*="price"], [class*="prix"]').first().text().trim();
    const price     = parsePrice(priceText);
    const imgSrc    = card.find('img').first().attr('src') || null;

    if (!name) return null;
    return {
      source: 'Vinatis', source_url: url,
      name, price_avg: price, currency: 'EUR',
      availability: price ? 'Voir le site' : null,
      label_image: imgSrc || null,
    };
  } catch { return null; }
}

// ── Millésima — French premium wine merchant ──────────────────────────────────
async function millesimaScrape(query) {
  try {
    const url  = `https://www.millesima.fr/recherche?q=${encodeURIComponent(query)}`;
    const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
    const $    = cheerio.load(resp.data);

    for (const ld of extractAllJsonLd($)) {
      const items  = ld?.itemListElement || (Array.isArray(ld) ? ld : [ld]);
      const first  = items?.[0]?.item?.['@type'] === 'Product' ? items[0].item
                   : ld?.['@type'] === 'Product' ? ld : null;
      if (first?.name) {
        const offers = Array.isArray(first.offers) ? first.offers[0] : first.offers;
        return {
          source: 'Millésima', source_url: url,
          name:         first.name,
          price_avg:    offers?.price ? parseFloat(offers.price) : null,
          currency:     offers?.priceCurrency || 'EUR',
          availability: offers?.availability?.includes('InStock') ? 'En stock' : 'Voir le site',
          label_image:  Array.isArray(first.image) ? first.image[0] : (first.image || null),
        };
      }
    }

    const card      = $('[class*="product"], .wine-item, [class*="produit"]').first();
    if (!card.length) return null;
    const name      = card.find('[class*="name"], [class*="titre"], h2, h3').first().text().trim();
    const priceText = card.find('[class*="price"], [class*="prix"]').first().text().trim();
    if (!name) return null;
    return { source: 'Millésima', source_url: url, name, price_avg: parsePrice(priceText), currency: 'EUR', availability: 'Voir le site' };
  } catch { return null; }
}

// ── Nicolas — French mass-market wine retailer ────────────────────────────────
async function nicolasScrape(query) {
  try {
    const url  = `https://www.nicolas.com/recherche?q=${encodeURIComponent(query)}`;
    const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
    const $    = cheerio.load(resp.data);

    // Try Next.js data first
    const nd = extractNextData($);
    if (nd) {
      const products = nd?.props?.pageProps?.products || nd?.props?.pageProps?.results || [];
      const first = products[0];
      if (first?.name) {
        return {
          source: 'Nicolas', source_url: url,
          name:         first.name,
          price_avg:    first.price ? parseFloat(first.price) : null,
          currency:     'EUR',
          availability: first.inStock ? 'En stock' : 'Voir le site',
          label_image:  first.image?.url || first.imageUrl || null,
        };
      }
    }

    // JSON-LD fallback
    for (const ld of extractAllJsonLd($)) {
      if (ld?.['@type'] === 'Product' && ld?.name) {
        const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
        return {
          source: 'Nicolas', source_url: url,
          name:         ld.name,
          price_avg:    offers?.price ? parseFloat(offers.price) : null,
          currency:     offers?.priceCurrency || 'EUR',
          availability: offers?.availability?.includes('InStock') ? 'En stock' : 'Voir le site',
          label_image:  ld.image || null,
        };
      }
    }

    const card      = $('[class*="product"], .item, [class*="wine"]').first();
    if (!card.length) return null;
    const name      = card.find('[class*="name"], [class*="titre"], h2, h3').first().text().trim();
    const priceText = card.find('[class*="price"], [class*="prix"]').first().text().trim();
    if (!name) return null;
    return { source: 'Nicolas', source_url: url, name, price_avg: parsePrice(priceText), currency: 'EUR', availability: 'Voir le site' };
  } catch { return null; }
}

// ── ChateauOnline — French premium wine shop ──────────────────────────────────
async function chateauOnlineScrape(query) {
  try {
    const url  = `https://www.chateauonline.fr/search?q=${encodeURIComponent(query)}`;
    const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
    const $    = cheerio.load(resp.data);

    for (const ld of extractAllJsonLd($)) {
      if (ld?.['@type'] === 'Product' && ld?.name) {
        const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
        return {
          source: 'ChateauOnline', source_url: url,
          name:         ld.name,
          price_avg:    offers?.price ? parseFloat(offers.price) : null,
          currency:     offers?.priceCurrency || 'EUR',
          availability: offers?.availability?.includes('InStock') ? 'En stock' : 'Voir le site',
          label_image:  ld.image || null,
        };
      }
    }

    const card      = $('[class*="product"], [class*="wine"], article').first();
    if (!card.length) return null;
    const name      = card.find('h2, h3, [class*="name"]').first().text().trim();
    const priceText = card.find('[class*="price"], [class*="prix"]').first().text().trim();
    if (!name) return null;
    return { source: 'ChateauOnline', source_url: url, name, price_avg: parsePrice(priceText), currency: 'EUR', availability: 'Voir le site' };
  } catch { return null; }
}

// ── iDéalwine — French auction house ─────────────────────────────────────────
async function idealwineScrape(query) {
  try {
    const url  = `https://www.idealwine.com/fr/recherche/index.jsp?textRecherche=${encodeURIComponent(query)}&typeRecherche=full_text`;
    const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
    const $    = cheerio.load(resp.data);

    for (const ld of extractAllJsonLd($)) {
      if (ld?.name) {
        const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
        return {
          source: 'iDéalwine', source_url: url,
          name:         ld.name,
          price_avg:    offers?.price ? parseFloat(offers.price) : null,
          currency:     offers?.priceCurrency || 'EUR',
          availability: 'Enchères',
        };
      }
    }

    const card      = $('[class*="product"], .wine-item, article').first();
    if (!card.length) return null;
    const name      = card.find('h2, h3, [class*="name"]').first().text().trim();
    const priceText = card.find('[class*="price"], [class*="prix"]').first().text().trim();
    if (!name) return null;
    return { source: 'iDéalwine', source_url: url, name, price_avg: parsePrice(priceText), currency: 'EUR', availability: 'Enchères' };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEER SCRAPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Open Food Facts — beer lookup ─────────────────────────────────────────────
async function openFoodFactsBeerSearch(query) {
  try {
    const BEER_FIELDS = [
      'code', 'product_name', 'brands', 'origins', 'countries_tags',
      'categories_tags', 'labels_tags', 'ingredients_text',
      'image_front_url', 'image_url', 'quantity', 'alcohol_100g',
    ].join(',');

    const { data } = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
      params: {
        search_terms: query,
        tagtype_0: 'categories', tag_0: 'beers',
        action: 'process', json: 1, page_size: 3, fields: BEER_FIELDS,
      },
      headers: { ...HEADERS, Accept: 'application/json' },
      timeout: TIMEOUT,
    });

    const first = (data.products || []).find(p => p.product_name);
    if (!first) return null;
    return {
      source:    'Open Food Facts',
      name:      first.product_name,
      brewery:   first.brands?.split(',')[0].trim() || null,
      type:      mapBeerType((first.categories_tags || []).join(' ')),
      abv:       first.alcohol_100g ? parseFloat(first.alcohol_100g) : null,
      label_url: first.image_front_url || first.image_url || null,
      grapes:    first.ingredients_text?.slice(0, 200) || null,
    };
  } catch { return null; }
}

// ── V&B ───────────────────────────────────────────────────────────────────────
async function vAndBSearch(query) {
  try {
    const { data } = await axios.get('https://www.vandb.fr/search', {
      params: { q: query }, headers: HEADERS, timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);

    for (const ld of extractAllJsonLd($)) {
      const items = ld?.itemListElement || (Array.isArray(ld) ? ld : [ld]);
      const first = items?.[0]?.item || items?.[0];
      if (first?.['@type'] === 'Product' && first?.name) {
        return { source: 'V&B', name: first.name, brewery: first.brand?.name || null, notes: first.description || null, label_url: first.image || null };
      }
    }

    const card     = $('.product-item, [class*="product_item"], article.product').first();
    if (!card.length) return null;
    const name     = card.find('[class*="product-name"], h2, h3').first().text().trim();
    const brewery  = card.find('[class*="brand"], [class*="brewery"]').first().text().trim();
    const abvText  = card.find('[class*="abv"], [class*="degre"]').first().text().trim();
    if (!name) return null;
    return { source: 'V&B', name, brewery: brewery || null, abv: abvText ? parseFloat(abvText.replace(',', '.')) : null, label_url: card.find('img').first().attr('src') || null };
  } catch { return null; }
}

// ── Untappd ───────────────────────────────────────────────────────────────────
async function untappdSearch(query) {
  try {
    const { data } = await axios.get('https://untappd.com/search', {
      params: { q: query, type: 'beer' },
      headers: { ...HEADERS, Referer: 'https://untappd.com/' },
      timeout: TIMEOUT,
    });
    const $    = cheerio.load(data);
    const first = $('.beer-item, [class*="beer_item"]').first();
    if (!first.length) return null;
    const name    = first.find('.beer-name, h1, h2').first().text().trim();
    const brewery = first.find('.brewery, .brewer').first().text().trim();
    const style   = first.find('.style, [class*="style"]').first().text().trim();
    const abvTxt  = first.find('[class*="abv"]').first().text().trim();
    if (!name) return null;
    return { source: 'Untappd', name, brewery: brewery || null, type: mapBeerType(style), abv: abvTxt ? parseFloat(abvTxt.replace(/[^\d.]/g, '')) || null : null, notes: style || null, label_url: first.find('img.label, img[class*="label"]').first().attr('src') || null };
  } catch { return null; }
}

// ── RateBeer ──────────────────────────────────────────────────────────────────
async function rateBeerSearch(query) {
  try {
    const { data } = await axios.get('https://www.ratebeer.com/search/', {
      params: { beername: query }, headers: HEADERS, timeout: TIMEOUT,
    });
    const $ = cheerio.load(data);
    for (const ld of extractAllJsonLd($)) {
      const item = Array.isArray(ld) ? ld[0] : ld;
      if (item?.name) return { source: 'RateBeer', name: item.name, brewery: item.brand?.name || null, notes: item.description || null, label_url: item.image || null };
    }
    const first = $('[class*="beer"], .search-result').first();
    if (!first.length) return null;
    const name = first.find('a, h3, h2').first().text().trim();
    return name ? { source: 'RateBeer', name } : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — WINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EAN barcode → enriched wine data.
 * Flow: UPC ItemDB (name) → OFf by EAN → Vivino (enrich) → Oeni → Liv-ex
 */
async function scrapeWineByEan(ean) {
  // Try OFf directly by EAN first (most accurate)
  const offDirect = await openFoodFactsByEan(ean);
  if (offDirect?.name) return offDirect;

  // Resolve EAN to a product name, then search
  const upc = await upcItemDbLookup(ean);
  if (!upc?.name) return null;
  return scrapeWineByName(upc.name, upc.producer);
}

/**
 * Wine name → enriched wine data.
 * Runs Vivino + OFf + Wine-Searcher in parallel, then falls back to Oeni/Liv-ex.
 * Returns the richest result.
 */
async function scrapeWineByName(name, hint) {
  const query = [name, hint].filter(Boolean).join(' ').trim();

  const [vivinoR, offR, wsR] = await Promise.allSettled([
    vivinoSearch(query),
    openFoodFactsSearch(query),
    wineSearcherSearch(name, hint),
  ]);

  const vivino = vivinoR.status === 'fulfilled' ? vivinoR.value : null;
  const off    = (offR.status === 'fulfilled' ? offR.value : []) || [];
  const ws     = wsR.status === 'fulfilled' ? wsR.value : null;

  // Vivino has the richest structured data — use as base
  if (vivino?.name) {
    // Merge Wine-Searcher price/rating if Vivino is missing it
    if (ws && !vivino.price_avg && ws.price_avg) vivino.price_avg = ws.price_avg;
    if (ws && !vivino.rating && ws.rating)        vivino.rating   = ws.rating;
    return vivino;
  }

  // OFf second choice
  if (off[0]?.name) return off[0];

  // Wine-Searcher third
  if (ws?.name) return ws;

  // Serial fallbacks
  const oeni = await oeniSearch(query);
  if (oeni?.name) return oeni;

  const livex = await livexSearch(query);
  return livex?.name ? livex : null;
}

/**
 * Fetch all price sources in parallel for the /market route.
 * Returns array of price results from all available merchants.
 */
async function fetchAllMarketPrices(wine) {
  const query = [wine.name, wine.producer, wine.vintage].filter(Boolean).join(' ');

  const tasks = await Promise.allSettled([
    vivinoSearch(query),
    wineSearcherSearch(wine.name, wine.vintage),
    vinatisScrape(query),
    millesimaScrape(query),
    nicolasScrape(query),
    chateauOnlineScrape(query),
    idealwineScrape(query),
  ]);

  const results = [];

  // Vivino — can return multiple matches
  const vivinoData = tasks[0].status === 'fulfilled' ? tasks[0].value : null;
  if (vivinoData?.name) {
    results.push({
      source:        'Vivino',
      source_url:    `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`,
      name:          vivinoData.name,
      vintage:       vivinoData.vintage || null,
      price_avg:     vivinoData.price_avg,
      price_min:     vivinoData.price_min,
      price_max:     vivinoData.price_max,
      currency:      vivinoData.currency || 'EUR',
      rating:        vivinoData.rating,
      ratings_count: vivinoData.ratings_count,
      availability:  vivinoData.price_avg ? 'En ligne' : null,
    });
  }

  // Wine-Searcher
  const wsData = tasks[1].status === 'fulfilled' ? tasks[1].value : null;
  if (wsData?.name) {
    results.push({
      source:         'Wine-Searcher',
      source_url:     wsData.source_url,
      name:           wsData.name,
      price_avg:      wsData.price_avg,
      price_min:      wsData.price_min,
      price_max:      wsData.price_max,
      currency:       wsData.currency || 'EUR',
      rating:         wsData.rating,
      merchant_count: wsData.merchant_count,
      availability:   wsData.price_avg ? `${wsData.merchant_count ? wsData.merchant_count + ' marchands' : 'En ligne'}` : null,
    });
  }

  // Remaining single-result scrapers
  const scrapers = [
    tasks[2], // Vinatis
    tasks[3], // Millésima
    tasks[4], // Nicolas
    tasks[5], // ChateauOnline
    tasks[6], // iDéalwine
  ];
  for (const r of scrapers) {
    if (r.status === 'fulfilled' && r.value?.name) results.push(r.value);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — BEER
// ═══════════════════════════════════════════════════════════════════════════════

async function scrapeBeerByEan(ean) {
  const upc = await upcItemDbLookup(ean);
  if (!upc?.name) return null;
  return scrapeBeerByName(upc.name, upc.producer);
}

async function scrapeBeerByName(name, hint) {
  const query = [name, hint].filter(Boolean).join(' ').trim();

  const [offR, vandbR, untappdR] = await Promise.allSettled([
    openFoodFactsBeerSearch(query),
    vAndBSearch(query),
    untappdSearch(query),
  ]);

  const off    = offR.status === 'fulfilled'    ? offR.value    : null;
  const vandb  = vandbR.status === 'fulfilled'  ? vandbR.value  : null;
  const untap  = untappdR.status === 'fulfilled' ? untappdR.value : null;

  if (off?.name)   return off;
  if (vandb?.name) return vandb;
  if (untap?.name) return untap;

  const ratebeer = await rateBeerSearch(query);
  return ratebeer?.name ? ratebeer : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
module.exports = {
  // Wine enrichment
  scrapeWineByEan, scrapeWineByName, vivinoSearch,
  openFoodFactsSearch, openFoodFactsByEan, wineSearcherSearch,
  // Wine market prices
  fetchAllMarketPrices,
  vinatisScrape, millesimaScrape, nicolasScrape, chateauOnlineScrape, idealwineScrape,
  // Beer
  scrapeBeerByEan, scrapeBeerByName, mapBeerType,
};
