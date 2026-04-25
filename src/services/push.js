// otto — web-push helper. Wraps the `web-push` lib + PushSubscription model.
//
// Sends the same payload to ALL subscriptions a user owns, transparently
// pruning stale endpoints (Apple/Google return 410 when the user uninstalls
// or revokes the permission).
//
// notifyUser supports an optional `kind` ∈ ['matches','messages','reviews'] —
// when provided, the user's pushPrefs[kind] must be true for the notification
// to be delivered.

import webpush from 'web-push';

import PushSubscription from '../models/PushSubscription.js';
import User from '../models/User.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@otto.local';

let _configured = false;
function ensureConfigured() {
  if (_configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not set — push disabled');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  _configured = true;
  return true;
}

// Configure at module load. Failures are non-fatal — calls become no-ops.
ensureConfigured();

export async function subscribe(userId, sub, ua = '') {
  if (!userId || !sub || !sub.endpoint) {
    throw new Error('subscribe: missing userId or subscription');
  }
  const keys = sub.keys || {};
  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      $set: {
        userId,
        endpoint: sub.endpoint,
        keys: { p256dh: keys.p256dh || '', auth: keys.auth || '' },
        userAgent: ua,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );
  return doc;
}

export async function unsubscribe(userId, endpoint) {
  if (!endpoint) return 0;
  const q = { endpoint };
  if (userId) q.userId = userId;
  const r = await PushSubscription.deleteOne(q);
  return r.deletedCount || 0;
}

export async function notifyUser(userId, payload, kind = null) {
  if (!ensureConfigured()) return { sent: 0, errors: 0, removed: 0 };
  if (!userId) return { sent: 0, errors: 0, removed: 0 };

  // Honour user push preferences when a kind is provided.
  if (kind) {
    try {
      const u = await User.findById(userId).select('pushPrefs').lean();
      const prefs = (u && u.pushPrefs) || {};
      if (prefs[kind] === false) {
        console.log(`[pushPrefs] user=${userId} kind=${kind} disabled — skip`);
        return { sent: 0, errors: 0, removed: 0 };
      }
    } catch (e) {
      console.warn('[pushPrefs] lookup failed:', e.message);
    }
  }

  const subs = await PushSubscription.find({ userId }).lean();
  if (!subs.length) return { sent: 0, errors: 0, removed: 0 };

  const body = JSON.stringify(payload || {});
  let sent = 0;
  let errors = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: s.keys || {},
      };
      try {
        await webpush.sendNotification(subscription, body);
        sent += 1;
      } catch (err) {
        errors += 1;
        const code = err && err.statusCode;
        if (code === 410 || code === 404) {
          await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          removed += 1;
        } else {
          console.error('[push] send error:', code, err && err.body);
        }
      }
    })
  );

  return { sent, errors, removed };
}

export default { subscribe, unsubscribe, notifyUser };
