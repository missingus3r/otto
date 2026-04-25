// otto — listing moderation / anti-spam heuristics
//
// Cheap keyword + price-range checks. Anything that trips → moderationStatus
// 'pending' so an admin reviews before the listing goes public.

const SPAM_KEYWORDS = [
  'viagra',
  'casino',
  'telegram bot',
  'sextoy',
  'escort',
  'btc multiply',
  'free money',
  'gana dinero rapido',
  'click aquí',
];

function containsSpamKeyword(haystack) {
  const lower = String(haystack || '').toLowerCase();
  for (const kw of SPAM_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

/**
 * Run auto-flag heuristics on a listing-like object (plain or document).
 * Returns { flagged: boolean, reason: string }. Reason is empty if not flagged.
 */
export function runAutoFlag(listing) {
  if (!listing) return { flagged: false, reason: '' };

  const text = `${listing.title || ''} ${listing.description || ''}`;
  const kw = containsSpamKeyword(text);
  if (kw) {
    return { flagged: true, reason: `spam_keyword:${kw}` };
  }

  const min = Number(listing.priceMin) || 0;
  const max = Number(listing.priceMax) || 0;
  if (min > 0 && max > min * 50) {
    return { flagged: true, reason: 'sus_price_range' };
  }

  return { flagged: false, reason: '' };
}

export { SPAM_KEYWORDS };

export default { runAutoFlag, SPAM_KEYWORDS };
