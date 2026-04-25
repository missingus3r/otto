import express from 'express';

import requireAuth from '../middleware/requireAuth.js';
import Match from '../models/Match.js';
import Listing from '../models/Listing.js';
import Transaction from '../models/Transaction.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Review from '../models/Review.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    // matches involving any listing owned by user
    const myListings = await Listing.find({ userId: req.user._id }).select('_id').lean();
    const ids = myListings.map((l) => l._id);

    const matches = await Match.find({
      $or: [{ listingA: { $in: ids } }, { listingB: { $in: ids } }],
    })
      .sort({ createdAt: -1 })
      .populate('listingA')
      .populate('listingB')
      .lean();

    // Build a map matchId → { txId, completed, reviewLeft } so the view can
    // surface a "Dejar reseña" button on completed transactions where this
    // user has not yet reviewed.
    const matchIds = matches.map((m) => m._id);
    const txs = await Transaction.find({ matchId: { $in: matchIds } })
      .select('_id matchId status')
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

    res.render('app/matches', { matches, myIds: ids.map(String), reviewInfo });
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
      // figure out buyer/seller — for sell/buy pairs the seller is the 'sell' listing owner.
      let buyerId = ownerA;
      let sellerId = ownerB;
      if (m.listingA.type === 'sell' && m.listingB.type === 'buy') {
        sellerId = ownerA;
        buyerId = ownerB;
      } else if (m.listingA.type === 'buy' && m.listingB.type === 'sell') {
        buyerId = ownerA;
        sellerId = ownerB;
      } // swap → buyer/seller arbitrary, leave as-is

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

      // close both listings
      await Listing.updateMany(
        { _id: { $in: [m.listingA._id, m.listingB._id] } },
        { $set: { status: 'closed' } }
      );
    } else {
      // mark listings as 'matched' in the meantime
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

    // re-open the listings if they were "matched" but not closed
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

export default router;
