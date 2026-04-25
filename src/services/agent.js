import cron from 'node-cron';
import crypto from 'crypto';

import Listing from '../models/Listing.js';
import Match from '../models/Match.js';
import AgentLog from '../models/AgentLog.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { matchListings } from './llm.js';
import { getMarketBaseline } from './priceScraper.js';
import { notifyUser } from './push.js';
import { tForLang } from './i18n.js';
import User from '../models/User.js';

const BATCH_SIZE = 30;
const PRICE_SCRAPE_ENABLED = process.env.PRICE_SCRAPE_ENABLED === 'true';
const ACCOUNT_DELETION_GRACE_DAYS = parseInt(
  process.env.ACCOUNT_DELETION_GRACE_DAYS || '7',
  10
);

// in-memory pause flag — admin can flip via /admin/agent/pause
let _paused = false;
let _scheduledTask = null;
let _running = false;
let _deletionTask = null;

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

// Sweep at the start of every run:
//  1) Expire matches whose expiresAt has passed (any non-terminal status).
//  2) Reopen listings that are still 'matched' but have no live match.
async function expireAndCleanup() {
  const now = new Date();

  const expiredR = await Match.updateMany(
    {
      status: { $in: ['proposed', 'accepted_a', 'accepted_b'] },
      expiresAt: { $lt: now },
    },
    { $set: { status: 'expired' } }
  );
  if (expiredR.modifiedCount) {
    console.log(`[agent] expired ${expiredR.modifiedCount} stale matches`);
  }

  // For each listing currently 'matched', if there is no Match in a live state
  // referencing it, reopen it.
  const matchedListings = await Listing.find({ status: 'matched' })
    .select('_id')
    .lean();
  if (matchedListings.length) {
    const liveMatches = await Match.find({
      $or: [
        { listingA: { $in: matchedListings.map((l) => l._id) } },
        { listingB: { $in: matchedListings.map((l) => l._id) } },
      ],
      status: { $in: ['proposed', 'accepted_a', 'accepted_b', 'accepted_both'] },
    })
      .select('listingA listingB')
      .lean();

    const liveSet = new Set();
    for (const m of liveMatches) {
      liveSet.add(String(m.listingA));
      liveSet.add(String(m.listingB));
    }

    const toReopen = matchedListings
      .map((l) => l._id)
      .filter((id) => !liveSet.has(String(id)));

    if (toReopen.length) {
      await Listing.updateMany(
        { _id: { $in: toReopen }, status: 'matched' },
        { $set: { status: 'open' } }
      );
      console.log(`[agent] reopened ${toReopen.length} orphan matched listings`);
    }
  }
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
    // sweep stale matches & orphan-matched listings BEFORE pulling open ones.
    await expireAndCleanup();

    const openListings = await Listing.find({
      status: 'open',
      moderationStatus: { $nin: ['pending', 'rejected'] },
    }).lean();
    listingsScanned = openListings.length;

    if (listingsScanned < 2) {
      console.log('[agent] not enough open listings to match');
    } else {
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
          // Hard rule: same category required.
          if (a.category && b.category && a.category !== b.category) {
            continue;
          }
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

          // Push notify both owners in their own language. Wrapped in
          // try/catch — agent must NOT crash if push fails for any reason.
          try {
            const shortRationale = (created.agentRationale || '').slice(0, 140);
            const buildPayload = (lang) => ({
              title: tForLang(lang, 'push.match.title'),
              body: shortRationale || tForLang(lang, 'push.match.fallback'),
              url: '/matches',
            });
            const [userA, userB] = await Promise.all([
              User.findById(a.userId).select('lang').lean(),
              User.findById(b.userId).select('lang').lean(),
            ]);
            const langA = (userA && userA.lang) || process.env.DEFAULT_LANG || 'es';
            const langB = (userB && userB.lang) || process.env.DEFAULT_LANG || 'es';
            await Promise.all([
              notifyUser(a.userId, buildPayload(langA), 'matches').catch((e) =>
                console.error('[push] notify A failed:', e.message)
              ),
              notifyUser(b.userId, buildPayload(langB), 'matches').catch((e) =>
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

// ─────────────────────────────────────────────────────────────────────────
// Account deletion sweeper — runs daily. Anonymizes users whose
// deletionRequestedAt is older than ACCOUNT_DELETION_GRACE_DAYS.
// ─────────────────────────────────────────────────────────────────────────
export async function runAccountDeletionSweep() {
  const cutoff = new Date(
    Date.now() - ACCOUNT_DELETION_GRACE_DAYS * 86400 * 1000
  );
  const candidates = await User.find({
    deletionRequestedAt: { $lt: cutoff },
    banned: { $ne: true },
  });

  let count = 0;
  for (const u of candidates) {
    try {
      const id = String(u._id);
      u.email = `deleted-${id}@otto.local`;
      u.displayName = 'Usuario eliminado';
      u.passwordHash = '';
      u.banned = true;
      u.banReason = 'account_deleted';
      u.emailVerified = false;
      u.emailVerifyToken = null;
      u.passwordResetToken = null;
      u.pendingEmail = null;
      u.pendingEmailToken = null;
      await u.save();
      count += 1;
      console.log(`[deletion] anonymized user ${id}`);
    } catch (err) {
      console.error('[deletion] sweep error:', err.message);
    }
  }
  if (count) console.log(`[deletion] swept ${count} accounts`);
  return count;
}

export function startAccountDeletionCron() {
  if (_deletionTask) return _deletionTask;
  // every day at 03:13 server time
  _deletionTask = cron.schedule('13 3 * * *', () => {
    runAccountDeletionSweep().catch((e) =>
      console.error('[deletion] tick error:', e)
    );
  });
  console.log('[deletion] cron scheduled (daily 03:13)');
  return _deletionTask;
}

export default {
  runOnce,
  startAgentCron,
  pause,
  resume,
  isPaused,
  runAccountDeletionSweep,
  startAccountDeletionCron,
};
