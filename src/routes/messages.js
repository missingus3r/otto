import express from 'express';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Match from '../models/Match.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { notifyUser } from '../services/push.js';
import { tForLang } from '../services/i18n.js';

const router = express.Router();
router.use(requireAuth);

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

async function loadMatchAndAssertParty(matchId, userId) {
  const m = await Match.findById(matchId).populate('listingA').populate('listingB');
  if (!m) return { error: 'not_found' };
  const ownerA = String(m.listingA.userId);
  const ownerB = String(m.listingB.userId);
  if (String(userId) !== ownerA && String(userId) !== ownerB) {
    return { error: 'forbidden' };
  }
  return { m, ownerA, ownerB };
}

router.get('/:matchId', async (req, res, next) => {
  try {
    const { error, m, ownerA, ownerB } = await loadMatchAndAssertParty(
      req.params.matchId,
      req.user._id
    );
    if (error === 'not_found') {
      return res.status(404).render('error', { status: 404, message: 'Not found' });
    }
    if (error === 'forbidden') {
      return res.status(403).render('error', {
        status: 403,
        message: res.locals.t('messages.forbidden'),
      });
    }

    const messages = await Message.find({ matchId: m._id })
      .sort({ createdAt: 1 })
      .lean();

    // Mark as seen those received and not yet seen.
    await Message.updateMany(
      {
        matchId: m._id,
        fromUserId: { $ne: req.user._id },
        seenAt: { $exists: false },
      },
      { $set: { seenAt: new Date() } }
    );

    const otherId = ownerA === String(req.user._id) ? ownerB : ownerA;
    const other = await User.findById(otherId).select('displayName email').lean();

    res.render('app/messages', {
      match: m.toObject(),
      messages,
      other,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:matchId', async (req, res, next) => {
  try {
    const { error, m, ownerA, ownerB } = await loadMatchAndAssertParty(
      req.params.matchId,
      req.user._id
    );
    if (error === 'not_found') {
      return res.status(404).render('error', { status: 404, message: 'Not found' });
    }
    if (error === 'forbidden') {
      return res.status(403).render('error', {
        status: 403,
        message: res.locals.t('messages.forbidden'),
      });
    }

    const body = clean(req.body.body).slice(0, 1000);
    if (!body) return res.redirect(`/messages/${m._id}`);

    await Message.create({
      matchId: m._id,
      fromUserId: req.user._id,
      body,
    });

    const otherId = ownerA === String(req.user._id) ? ownerB : ownerA;
    try {
      const other = await User.findById(otherId).select('lang').lean();
      const lang = (other && other.lang) || process.env.DEFAULT_LANG || 'es';
      await notifyUser(
        otherId,
        {
          title: tForLang(lang, 'push.message.title'),
          body: body.slice(0, 140) || tForLang(lang, 'push.message.body'),
          url: `/messages/${m._id}`,
        },
        'messages'
      );
    } catch (e) {
      console.warn('[push] message notify failed:', e.message);
    }

    res.redirect(`/messages/${m._id}`);
  } catch (err) {
    next(err);
  }
});

// Long-poll style fetch — returns messages newer than ?since=ISODATE
router.get('/:matchId/poll', async (req, res, next) => {
  try {
    const { error, m } = await loadMatchAndAssertParty(req.params.matchId, req.user._id);
    if (error === 'not_found') return res.status(404).json({ ok: false, error: 'not_found' });
    if (error === 'forbidden') return res.status(403).json({ ok: false, error: 'forbidden' });

    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    const filter = { matchId: m._id };
    if (!Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
    const fresh = await Message.find(filter).sort({ createdAt: 1 }).lean();
    res.json({
      ok: true,
      now: new Date().toISOString(),
      messages: fresh.map((m2) => ({
        _id: String(m2._id),
        fromUserId: String(m2.fromUserId),
        body: m2.body,
        createdAt: m2.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
