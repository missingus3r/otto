import express from 'express';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Review from '../models/Review.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { notifyUser } from '../services/push.js';
import { tForLang } from '../services/i18n.js';

const router = express.Router();
router.use(requireAuth);

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

// Determine the counterpart user for this transaction.
function counterpartFor(tx, myId) {
  const buyer = String(tx.buyerId);
  const seller = String(tx.sellerId);
  const me = String(myId);
  if (me === buyer) return seller;
  if (me === seller) return buyer;
  return null;
}

router.get('/new/:transactionId', async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.transactionId).lean();
    if (!tx) {
      return res.status(404).render('error', { status: 404, message: 'Transaction not found' });
    }
    const myId = String(req.user._id);
    const isPart = myId === String(tx.buyerId) || myId === String(tx.sellerId);
    if (!isPart) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (tx.status !== 'completed') {
      return res.status(400).render('error', {
        status: 400,
        message: res.locals.t('review.txNotCompleted') || 'Transaction not completed yet',
      });
    }
    const existing = await Review.findOne({
      transactionId: tx._id,
      fromUserId: req.user._id,
    }).lean();
    if (existing) {
      return res.redirect('/profile');
    }
    const toUserId = counterpartFor(tx, myId);
    res.render('app/new-review', { tx, toUserId, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const transactionId = String(req.body.transactionId || '').trim();
    const rating = Math.max(1, Math.min(5, parseInt(req.body.rating, 10) || 0));
    const comment = clean(req.body.comment).slice(0, 500);

    if (!transactionId || !rating) {
      return res.status(400).render('error', {
        status: 400,
        message: res.locals.t('review.invalid') || 'Invalid review',
      });
    }

    const tx = await Transaction.findById(transactionId).lean();
    if (!tx) return res.status(404).render('error', { status: 404, message: 'Not found' });

    const myId = String(req.user._id);
    const isPart = myId === String(tx.buyerId) || myId === String(tx.sellerId);
    if (!isPart) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (tx.status !== 'completed') {
      return res.status(400).render('error', {
        status: 400,
        message: res.locals.t('review.txNotCompleted') || 'Transaction not completed yet',
      });
    }

    const toUserId = counterpartFor(tx, myId);
    if (!toUserId) {
      return res.status(400).render('error', { status: 400, message: 'Bad target' });
    }

    try {
      await Review.create({
        fromUserId: req.user._id,
        toUserId,
        transactionId: tx._id,
        rating,
        comment,
      });
      try {
        const target = await User.findById(toUserId).select('lang').lean();
        const lang = (target && target.lang) || process.env.DEFAULT_LANG || 'es';
        await notifyUser(
          toUserId,
          {
            title: tForLang(lang, 'push.review.title'),
            body: tForLang(lang, 'push.review.body'),
            url: '/profile',
          },
          'reviews'
        );
      } catch (e) {
        console.warn('[push] review notify failed:', e.message);
      }
    } catch (err) {
      // duplicate (E11000) — user already left a review
      if (err && err.code === 11000) {
        return res.redirect('/profile');
      }
      throw err;
    }

    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

export default router;
