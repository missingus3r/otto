import express from 'express';

import requireAdmin from '../middleware/requireAdmin.js';
import User from '../models/User.js';
import Listing from '../models/Listing.js';
import Match from '../models/Match.js';
import Transaction from '../models/Transaction.js';
import LedgerEntry from '../models/LedgerEntry.js';
import AgentLog from '../models/AgentLog.js';
import { isPaused, pause, resume } from '../services/agent.js';

const router = express.Router();
router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [usersCount, openListings, pendingMatches, txToday, lastLog, pendingMod] =
      await Promise.all([
        User.countDocuments({}),
        Listing.countDocuments({ status: 'open' }),
        Match.countDocuments({ status: { $in: ['proposed', 'accepted_a', 'accepted_b'] } }),
        Transaction.countDocuments({ status: 'completed', completedAt: { $gte: startOfDay } }),
        AgentLog.findOne({}).sort({ startedAt: -1 }).lean(),
        Listing.countDocuments({
          $or: [{ moderationStatus: 'pending' }, { flagged: true }],
        }),
      ]);

    res.render('admin/dashboard', {
      counts: {
        users: usersCount,
        openListings,
        pendingMatches,
        txToday,
        pendingModeration: pendingMod,
      },
      lastLog,
      agentPaused: isPaused(),
    });
  } catch (err) {
    next(err);
  }
});

// Moderation queue — pending OR user-flagged listings.
router.get('/moderation', async (req, res, next) => {
  try {
    const listings = await Listing.find({
      $or: [{ moderationStatus: 'pending' }, { flagged: true }],
    })
      .populate('userId', 'email displayName')
      .sort({ flaggedAt: -1, createdAt: -1 })
      .limit(500)
      .lean();
    res.render('admin/moderation', { listings });
  } catch (err) {
    next(err);
  }
});

router.post('/listings/:id/approve', async (req, res, next) => {
  try {
    await Listing.updateOne(
      { _id: req.params.id },
      {
        $set: {
          moderationStatus: 'approved',
          flagged: false,
          flagReason: '',
        },
      }
    );
    res.redirect('/admin/moderation');
  } catch (err) {
    next(err);
  }
});

router.post('/listings/:id/reject', async (req, res, next) => {
  try {
    await Listing.updateOne(
      { _id: req.params.id },
      {
        $set: {
          moderationStatus: 'rejected',
          status: 'cancelled',
        },
      }
    );
    res.redirect('/admin/moderation');
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).limit(500).lean();
    res.render('admin/users', { users });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/ban', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { $set: { banned: true } });
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/unban', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { $set: { banned: false } });
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

router.get('/listings', async (req, res, next) => {
  try {
    const listings = await Listing.find({})
      .populate('userId', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.render('admin/listings', { listings });
  } catch (err) {
    next(err);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const txs = await Transaction.find({})
      .populate('buyerId', 'email displayName')
      .populate('sellerId', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.render('admin/transactions', { txs });
  } catch (err) {
    next(err);
  }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const entries = await LedgerEntry.find({}).sort({ createdAt: -1 }).limit(500).lean();
    res.render('admin/ledger', { entries });
  } catch (err) {
    next(err);
  }
});

router.get('/agent-log', async (req, res, next) => {
  try {
    const logs = await AgentLog.find({}).sort({ startedAt: -1 }).limit(200).lean();
    res.render('admin/agent-log', { logs, agentPaused: isPaused() });
  } catch (err) {
    next(err);
  }
});

router.post('/agent/pause', (req, res) => {
  pause();
  res.redirect('/admin');
});

router.post('/agent/resume', (req, res) => {
  resume();
  res.redirect('/admin');
});

export default router;
