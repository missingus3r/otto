// otto — image NSFW moderation via OpenAI moderation API.
//
// Strategy: send the image to OpenAI omni-moderation. If disabled or no key,
// returns { flagged: false, reason: 'disabled' } as a no-op fallback.

import fs from 'fs';
import OpenAI from 'openai';

const ENABLED = process.env.OPENAI_MODERATION_ENABLED === 'true';
const MODEL = process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';

let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Check an image at absolute path. Returns { flagged, reason }.
 * - Disabled / no key → { flagged: false, reason: 'disabled' }
 * - Network/parse errors → { flagged: false, reason: 'error:<msg>' }
 */
export async function checkImage(absPath) {
  if (!ENABLED) return { flagged: false, reason: 'disabled' };
  const client = getClient();
  if (!client) return { flagged: false, reason: 'disabled' };

  if (!absPath || !fs.existsSync(absPath)) {
    return { flagged: false, reason: 'no_file' };
  }

  try {
    const buf = fs.readFileSync(absPath);
    const ext = (absPath.split('.').pop() || 'jpg').toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
        ? 'image/gif'
        : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    const resp = await client.moderations.create({
      model: MODEL,
      input: [{ type: 'image_url', image_url: { url: dataUrl } }],
    });

    const result = resp && resp.results && resp.results[0];
    if (!result) return { flagged: false, reason: 'no_result' };

    if (result.flagged) {
      const cats = result.categories || {};
      const flaggedCats = Object.keys(cats).filter((k) => cats[k]);
      return {
        flagged: true,
        reason: flaggedCats.length ? flaggedCats.join(',') : 'flagged',
      };
    }
    return { flagged: false, reason: 'ok' };
  } catch (err) {
    console.warn('[nsfw] moderation error:', err.message);
    return { flagged: false, reason: 'error:' + err.message };
  }
}

export default { checkImage };
