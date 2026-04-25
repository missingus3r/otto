import cron from 'node-cron';
import crypto from 'crypto';

import Listing from '../models/Listing.js';
import Match from '../models/Match.js';
import AgentLog from '../models/AgentLog.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { matchListings } from './llm.js';
import { getMarketBaseline } from './priceScraper.js';
import { notifyUser } from './push.js';

const BATCH_SIZE = 30;
const PRICE_SCRAPE_ENABLED = process.env.PRICE_SCRAPE_ENABLED === 'true';

// in-memory pause flag — admin can flip via /admin/agent/pause
let _paused = false;
let _scheduledTask = null;
let _running = false;

export function isPaused() {
  return _paused;
}
export function pause() {
  _paused = true;
  console.log('[agent] paused');
}
export function resume() {
  _paused = false;
  console.log('[agent] resumed');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function existsMatch(aId, bId) {
  const ids = [aId, bId].sort((x, y) => String(x).localeCompare(String(y)));
  const found = await Match.findOne({
    $or: [
      { listingA: ids[0], listingB: ids[1] },
      { listingA: ids[1], listingB: ids[0] },
    ],
  });
  return !!found;
}

// Enrich each listing with a marketReference (median, samples, source) by
// hitting the public scraper. Runs in parallel; failures degrade to null.
async function enrichWithMarket(listings) {
  if (!PRICE_SCRAPE_ENABLED) return listings;
  const enriched = await Promise.all(
    listings.map(async (l) => {
      // skip swaps — no monetary baseline relevant.
      if (l.type === 'swap') return l;
      try {
        const baseline = await getMarketBaseline(l.title, l.currency || 'UYU');
        return { ...l, marketReference: baseline };
      } catch (err) {
        console.warn('[priceScraper] enrich failed:', err.message);
        return l;
      }
    })
  );
  return enriched;
}

export async function runOnce() {
  if (_running) {
    console.log('[agent] previous run still in progress — skipping');
    return null;
  }
  if (_paused) {
    console.log('[agent] paused — skipping run');
    return null;
  }

  _running = true;
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const log = await AgentLog.create({ runId, startedAt });

  let listingsScanned = 0;
  let matchesProposed = 0;
  let llmTokensUsed = 0;
  let errMsg = '';

  try {
    const openListings = await Listing.find({
      status: 'open',
      moderationStatus: { $nin: ['pending', 'rejected'] },
    }).lean();
    listingsScanned = openListings.length;

    if (listingsScanned < 2) {
      console.log('[agent] not enough open listings to match');
    } else {
      // expire any old matches
      await Match.updateMany(
        { status: 'proposed', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
      );

      for (const batch of chunk(openListings, BATCH_SIZE)) {
        // Inject market baselines (parallel; gated by env).
        const enrichedBatch = await enrichWithMarket(batch);

        let result;
        try {
          result = await matchListings(enrichedBatch);
        } catch (err) {
          console.error('[agent] llm batch failed:', err.message);
          continue;
        }
        llmTokensUsed += result.tokensUsed || 0;

        for (const m of result.matches) {
          // map back to listings in this batch (defensive)
          const a = batch.find((l) => String(l._id) === String(m.listingAId));
          const b = batch.find((l) => String(l._id) === String(m.listingBId));
          if (!a || !b) continue;
          if (String(a.userId) === String(b.userId)) continue;
          if (await existsMatch(a._id, b._id)) continue;

          const created = await Match.create({
            listingA: a._id,
            listingB: b._id,
            agentScore: Math.round(m.score),
            agentRationale: m.rationale || '',
            proposedPrice: Number(m.proposedPrice) || 0,
            currency: m.currency || a.currency || 'UYU',
            status: 'proposed',
          });

          await LedgerEntry.create({
            action: 'match_proposed',
            data: {
              matchId: created._id,
              listingA: a._id,
              listingB: b._id,
              score: created.agentScore,
              proposedPrice: created.proposedPrice,
              runId,
            },
          });

          // Push notify both owners. Wrapped in try/catch — agent must NOT
          // crash if push fails for any reason.
          try {
            const shortRationale =
              (created.agentRationale || '').slice(0, 140) || 'Hay un nuevo match para tu publicación.';
            const payload = {
              title: 'Nuevo match en otto',
              body: shortRationale,
              url: '/matches',
            };
            await Promise.all([
              notifyUser(a.userId, payload).catch((e) =>
                console.error('[push] notify A failed:', e.message)
              ),
              notifyUser(b.userId, payload).catch((e) =>
                console.error('[push] notify B failed:', e.message)
              ),
            ]);
          } catch (pushErr) {
            console.error('[push] notification block failed:', pushErr.message);
          }

          matchesProposed += 1;
        }
      }
    }
  } catch (err) {
    console.error('[agent] run failed:', err);
    errMsg = err.message || String(err);
  } finally {
    log.finishedAt = new Date();
    log.listingsScanned = listingsScanned;
    log.matchesProposed = matchesProposed;
    log.llmTokensUsed = llmTokensUsed;
    log.error = errMsg;
    await log.save();
    _running = false;
  }

  console.log(
    `[agent] run ${runId} done — scanned=${listingsScanned} proposed=${matchesProposed} tokens=${llmTokensUsed}${
      errMsg ? ' err=' + errMsg : ''
    }`
  );

  return log.toObject();
}

export function startAgentCron() {
  if (_scheduledTask) return _scheduledTask;
  const interval = parseInt(process.env.AGENT_INTERVAL_MIN || '5', 10);
  const expr = `*/${interval} * * * *`;
  if (!cron.validate(expr)) {
    console.warn('[agent] invalid cron expr, falling back to */5 * * * *');
  }
  _scheduledTask = cron.schedule(cron.validate(expr) ? expr : '*/5 * * * *', () => {
    runOnce().catch((e) => console.error('[agent] tick error:', e));
  });
  console.log(`[agent] scheduled (every ${interval} min)`);
  return _scheduledTask;
}

export default { runOnce, startAgentCron, pause, resume, isPaused };
