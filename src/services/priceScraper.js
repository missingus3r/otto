// otto — public price baseline (MercadoLibre Uruguay).
//
// Returns a coarse median for the first ~10 results. Cached per query for
// PRICE_SCRAPE_CACHE_HOURS to keep us off rate-limit. The caller MUST tolerate
// median: null (network failure or empty result).

import crypto from 'crypto';

import PriceCache from '../models/PriceCache.js';

const CACHE_HOURS = parseFloat(process.env.PRICE_SCRAPE_CACHE_HOURS || '6');
const SAMPLE_LIMIT = 10;

function hashQuery(query, currency) {
  return crypto
    .createHash('sha1')
    .update(`${currency}::${String(query || '').toLowerCase().trim()}`)
    .digest('hex');
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function fetchMercadoLibre(query) {
  const url = `https://listado.mercadolibre.com.uy/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`mercadolibre status ${res.status}`);
  const html = await res.text();

  // Match the integer fraction span. ML formats with a thousands separator
  // (".") that we strip before parseInt.
  const re = /<span class="andes-money-amount__fraction"[^>]*>([0-9.]+)<\/span>/g;
  const prices = [];
  let m;
  while ((m = re.exec(html)) !== null && prices.length < SAMPLE_LIMIT) {
    const cleaned = m[1].replace(/\./g, '');
    const n = parseInt(cleaned, 10);
    if (!Number.isNaN(n) && n > 0) prices.push(n);
  }
  return { prices, source: url };
}

export async function getMarketBaseline(query, currency = 'UYU') {
  const q = String(query || '').trim();
  if (!q) {
    return { median: null, samples: 0, source: 'unavailable', fetchedAt: new Date() };
  }

  const queryHash = hashQuery(q, currency);
  const ttlMs = CACHE_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  // cache hit?
  try {
    const cached = await PriceCache.findOne({ queryHash }).lean();
    if (cached && cached.fetchedAt && now - new Date(cached.fetchedAt).getTime() < ttlMs) {
      return {
        median: cached.median,
        samples: cached.samples,
        source: cached.source,
        fetchedAt: cached.fetchedAt,
      };
    }
  } catch (err) {
    console.warn('[priceScraper] cache read failed:', err.message);
  }

  // miss → scrape
  let result;
  try {
    const { prices, source } = await fetchMercadoLibre(q);
    if (!prices.length) {
      result = {
        median: null,
        samples: 0,
        source: 'unavailable',
        fetchedAt: new Date(),
      };
    } else {
      result = {
        median: median(prices),
        samples: prices.length,
        source,
        fetchedAt: new Date(),
      };
    }
  } catch (err) {
    console.warn('[priceScraper] scrape failed:', err.message);
    result = {
      median: null,
      samples: 0,
      source: 'unavailable',
      fetchedAt: new Date(),
    };
  }

  // persist (best-effort)
  try {
    await PriceCache.findOneAndUpdate(
      { queryHash },
      {
        $set: {
          queryHash,
          query: q,
          median: result.median,
          samples: result.samples,
          source: result.source,
          fetchedAt: result.fetchedAt,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[priceScraper] cache write failed:', err.message);
  }

  return result;
}

export default { getMarketBaseline };
