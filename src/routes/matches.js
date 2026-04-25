import express from 'express';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Match from '../models/Match.js';
import Listing from '../models/Listing.js';
import Transaction from '../models/Transaction.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Review from '../models/Review.js';
import Message from '../models/Message.js';

const router = express.Router();
router.use(requireAuth);

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

router.get('/', async (req, res, next) => {
  try {
    const myListings = await Listing.find({ userId: req.user._id }).select('_id').lean();
    const ids = myListings.map((l) => l._id);

    const matches = await Match.find({
      $or: [{ listingA: { $in: ids } }, { listingB: { $in: ids } }],
    })
      .sort({ createdAt: -1 })
      .populate('listingA')
      .populate('listingB')
      .lean();

    const matchIds = matches.map((m) => m._id);
    const txs = await Transaction.find({ matchId: { $in: matchIds } })
      .lean();
    const txByMatch = {};
    for (const tx of txs) txByMatch[String(tx.matchId)] = tx;

    const reviewedTxIds = new Set();
    if (txs.length) {
      const myReviews = await Review.find({
        fromUserId: req.user._id,
        transactionId: { $in: txs.map((t) => t._id) },
      })
        .select('transactionId')
        .lean();
      for (const r of myReviews) reviewedTxIds.add(String(r.transactionId));
    }

    const reviewInfo = {};
    for (const m of matches) {
      const tx = txByMatch[String(m._id)];
      if (!tx) continue;
      reviewInfo[String(m._id)] = {
        transactionId: String(tx._id),
        completed: tx.status === 'completed',
        reviewed: reviewedTxIds.has(String(tx._id)),
      };
    }

    res.render('app/matches', {
      matches,
      myIds: ids.map(String),
      reviewInfo,
      txByMatch,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/accept', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.id).populate('listingA').populate('listingB');
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });
    if (m.status === 'rejected' || m.status === 'expired' || m.status === 'accepted_both') {
      return res.redirect('/matches');
    }

    const userId = String(req.user._id);
    const ownerA = String(m.listingA.userId);
    const ownerB = String(m.listingB.userId);
    if (userId !== ownerA && userId !== ownerB) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }

    let nextStatus = m.status;
    if (userId === ownerA) {
      if (m.status === 'proposed') nextStatus = 'accepted_a';
      else if (m.status === 'accepted_b') nextStatus = 'accepted_both';
    } else {
      if (m.status === 'proposed') nextStatus = 'accepted_b';
      else if (m.status === 'accepted_a') nextStatus = 'accepted_both';
    }
    m.status = nextStatus;
    await m.save();

    if (nextStatus === 'accepted_both') {
      let buyerId = ownerA;
      let sellerId = ownerB;
      if (m.listingA.type === 'sell' && m.listingB.type === 'buy') {
        sellerId = ownerA;
        buyerId = ownerB;
      } else if (m.listingA.type === 'buy' && m.listingB.type === 'sell') {
        buyerId = ownerA;
        sellerId = ownerB;
      }

      const tx = await Transaction.create({
        matchId: m._id,
        buyerId,
        sellerId,
        finalPrice: m.proposedPrice,
        currency: m.currency,
        status: 'pending',
      });

      await LedgerEntry.create({
        action: 'match_accepted',
        transactionId: tx._id,
        data: {
          matchId: m._id,
          buyerId,
          sellerId,
          finalPrice: m.proposedPrice,
          currency: m.currency,
        },
      });

      await Listing.updateMany(
        { _id: { $in: [m.listingA._id, m.listingB._id] } },
        { $set: { status: 'closed' } }
      );
    } else {
      await Listing.updateMany(
        {
          _id: { $in: [m.listingA._id, m.listingB._id] },
          status: 'open',
        },
        { $set: { status: 'matched' } }
      );
    }

    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.id).populate('listingA').populate('listingB');
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });

    const userId = String(req.user._id);
    const ownerA = String(m.listingA.userId);
    const ownerB = String(m.listingB.userId);
    if (userId !== ownerA && userId !== ownerB) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }

    m.status = 'rejected';
    await m.save();

    await Listing.updateMany(
      {
        _id: { $in: [m.listingA._id, m.listingB._id] },
        status: 'matched',
      },
      { $set: { status: 'open' } }
    );

    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

// Mark complete (P0 #1) — both parties must mark.
router.post('/:matchId/complete', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.matchId);
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });
    const tx = await Transaction.findOne({ matchId: m._id });
    if (!tx) return res.status(404).render('error', { status: 404, message: 'No transaction' });
    if (tx.status !== 'pending') {
      req.session.flash = {
        type: 'error',
        message: tx.status === 'completed'
          ? res.locals.t('matches.completedAlready')
          : res.locals.t('matches.cancelledAlready'),
      };
      return res.redirect('/matches');
    }

    const userId = String(req.user._id);
    const isBuyer = userId === String(tx.buyerId);
    const isSeller = userId === String(tx.sellerId);
    if (!isBuyer && !isSeller) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }

    if (isBuyer && !tx.buyerCompletedAt) tx.buyerCompletedAt = new Date();
    if (isSeller && !tx.sellerCompletedAt) tx.sellerCompletedAt = new Date();

    if (tx.buyerCompletedAt && tx.sellerCompletedAt) {
      tx.status = 'completed';
      tx.completedAt = new Date();
      await tx.save();
      await LedgerEntry.create({
        action: 'transaction_completed',
        transactionId: tx._id,
        data: {
          matchId: m._id,
          buyerId: tx.buyerId,
          sellerId: tx.sellerId,
          finalPrice: tx.finalPrice,
          currency: tx.currency,
        },
      });
    } else {
      await tx.save();
      await LedgerEntry.create({
        action: 'transaction_half_completed',
        transactionId: tx._id,
        data: {
          matchId: m._id,
          markedBy: userId,
          buyerCompletedAt: tx.buyerCompletedAt,
          sellerCompletedAt: tx.sellerCompletedAt,
        },
      });
    }
    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

// Cancel a pending transaction (P1 #8).
router.post('/:matchId/cancel-tx', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.matchId).populate('listingA').populate('listingB');
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });
    const tx = await Transaction.findOne({ matchId: m._id });
    if (!tx) return res.status(404).render('error', { status: 404, message: 'No transaction' });

    const userId = String(req.user._id);
    const isPart = userId === String(tx.buyerId) || userId === String(tx.sellerId);
    if (!isPart) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (tx.status === 'completed') {
      return res.status(400).render('error', { status: 400, message: res.locals.t('matches.completedAlready') });
    }
    if (tx.status === 'cancelled') {
      return res.redirect('/matches');
    }

    tx.status = 'cancelled';
    tx.cancelledAt = new Date();
    await tx.save();

    // Reopen both listings if they're closed/matched.
    await Listing.updateMany(
      { _id: { $in: [m.listingA._id, m.listingB._id] }, status: { $in: ['closed', 'matched'] } },
      { $set: { status: 'open' } }
    );

    await LedgerEntry.create({
      action: 'transaction_cancelled',
      transactionId: tx._id,
      data: { matchId: m._id, cancelledBy: userId },
    });

    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

// Counter-offer (P1 #9) — push a new offer onto the match.
router.post('/:matchId/counter', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.matchId).populate('listingA').populate('listingB');
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });
    const userId = String(req.user._id);
    const ownerA = String(m.listingA.userId);
    const ownerB = String(m.listingB.userId);
    if (userId !== ownerA && userId !== ownerB) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (['rejected', 'expired', 'accepted_both'].includes(m.status)) {
      return res.redirect('/matches');
    }
    const price = Math.max(0, parseFloat(req.body.price) || 0);
    const message = clean(req.body.message).slice(0, 200);
    m.offers.push({
      fromUserId: req.user._id,
      price,
      message,
      status: 'proposed',
    });
    await m.save();
    await LedgerEntry.create({
      action: 'match_counter',
      data: { matchId: m._id, fromUserId: req.user._id, price, message },
    });
    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

router.post('/:matchId/offers/:offerId/accept', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.matchId).populate('listingA').populate('listingB');
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });

    const userId = String(req.user._id);
    const ownerA = String(m.listingA.userId);
    const ownerB = String(m.listingB.userId);
    if (userId !== ownerA && userId !== ownerB) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }

    const offer = m.offers.id(req.params.offerId);
    if (!offer) return res.status(404).render('error', { status: 404, message: 'Offer not found' });
    if (offer.status !== 'proposed') return res.redirect('/matches');
    if (String(offer.fromUserId) === userId) {
      return res.status(400).render('error', { status: 400, message: 'Cannot accept your own offer' });
    }

    offer.status = 'accepted';
    m.proposedPrice = offer.price;
    m.status = 'accepted_both';
    await m.save();

    let buyerId = ownerA;
    let sellerId = ownerB;
    if (m.listingA.type === 'sell' && m.listingB.type === 'buy') {
      sellerId = ownerA;
      buyerId = ownerB;
    } else if (m.listingA.type === 'buy' && m.listingB.type === 'sell') {
      buyerId = ownerA;
      sellerId = ownerB;
    }

    const tx = await Transaction.create({
      matchId: m._id,
      buyerId,
      sellerId,
      finalPrice: offer.price,
      currency: m.currency,
      status: 'pending',
    });

    await LedgerEntry.create({
      action: 'match_accepted',
      transactionId: tx._id,
      data: {
        matchId: m._id,
        buyerId,
        sellerId,
        finalPrice: offer.price,
        currency: m.currency,
        viaCounterOffer: true,
      },
    });

    await Listing.updateMany(
      { _id: { $in: [m.listingA._id, m.listingB._id] } },
      { $set: { status: 'closed' } }
    );

    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

router.post('/:matchId/offers/:offerId/reject', async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.matchId);
    if (!m) return res.status(404).render('error', { status: 404, message: 'Not found' });
    const offer = m.offers.id(req.params.offerId);
    if (!offer) return res.status(404).render('error', { status: 404, message: 'Offer not found' });

    const userId = String(req.user._id);
    if (String(offer.fromUserId) === userId) {
      return res.status(400).render('error', { status: 400, message: 'Cannot reject your own' });
    }
    offer.status = 'rejected';
    await m.save();
    res.redirect('/matches');
  } catch (err) {
    next(err);
  }
});

export default router;
