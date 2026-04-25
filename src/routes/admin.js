import express from 'express';

import requireAdmin from '../middleware/requireAdmin.js';
import User from '../models/User.js';
import Listing from '../models/Listing.js';
import Match from '../models/Match.js';
import Transaction from '../models/Transaction.js';
import LedgerEntry from '../models/LedgerEntry.js';
import AgentLog from '../models/AgentLog.js';
import AdminAction from '../models/AdminAction.js';
import { isPaused, pause, resume } from '../services/agent.js';
import { paginate } from '../util/paginate.js';
import { logAdminAction } from '../util/adminLog.js';

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

// Moderation queue. Two tabs: standard and appeals.
router.get('/moderation', async (req, res, next) => {
  try {
    const tab = req.query.tab === 'appeals' ? 'appeals' : 'queue';
    let query;
    if (tab === 'appeals') {
      query = Listing.find({
        moderationStatus: 'rejected',
        appealAt: { $exists: true, $ne: null },
      })
        .populate('userId', 'email displayName')
        .sort({ appealAt: -1 });
    } else {
      query = Listing.find({
        $or: [{ moderationStatus: 'pending' }, { flagged: true }],
      })
        .populate('userId', 'email displayName')
        .sort({ flaggedAt: -1, createdAt: -1 });
    }
    const { items, page, limit, total, pages } = await paginate(
      query,
      req.query.page,
      req.query.limit
    );
    res.render('admin/moderation', {
      listings: items,
      tab,
      pager: { page, limit, total, pages, base: `/admin/moderation?tab=${tab}` },
    });
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
          appealReason: '',
          appealAt: null,
        },
      }
    );
    await logAdminAction(req.user._id, 'listing.approve', 'listing', req.params.id);
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
    await logAdminAction(req.user._id, 'listing.reject', 'listing', req.params.id);
    res.redirect('/admin/moderation');
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      User.find({}).sort({ createdAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/users', {
      users: items,
      pager: { page, limit, total, pages, base: '/admin/users' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/ban', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { $set: { banned: true } });
    await logAdminAction(req.user._id, 'user.ban', 'user', req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/unban', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      $set: { banned: false, bannedUntil: null, banReason: '' },
    });
    await logAdminAction(req.user._id, 'user.unban', 'user', req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Temporary ban (P1 #10)
router.post('/users/:id/ban-temp', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.body.days, 10) || 1));
    const reason = String(req.body.reason || '').slice(0, 200);
    await User.findByIdAndUpdate(req.params.id, {
      $set: {
        bannedUntil: new Date(Date.now() + days * 86400 * 1000),
        banReason: reason,
      },
    });
    await logAdminAction(req.user._id, 'user.ban_temp', 'user', req.params.id, { days, reason });
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

router.get('/listings', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      Listing.find({}).populate('userId', 'email displayName').sort({ createdAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/listings', {
      listings: items,
      pager: { page, limit, total, pages, base: '/admin/listings' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      Transaction.find({})
        .populate('buyerId', 'email displayName')
        .populate('sellerId', 'email displayName')
        .sort({ createdAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/transactions', {
      txs: items,
      pager: { page, limit, total, pages, base: '/admin/transactions' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      LedgerEntry.find({}).sort({ createdAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/ledger', {
      entries: items,
      pager: { page, limit, total, pages, base: '/admin/ledger' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/agent-log', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      AgentLog.find({}).sort({ startedAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/agent-log', {
      logs: items,
      agentPaused: isPaused(),
      pager: { page, limit, total, pages, base: '/admin/agent-log' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/agent/pause', async (req, res) => {
  pause();
  await logAdminAction(req.user._id, 'agent.pause', 'agent', '');
  res.redirect('/admin');
});

router.post('/agent/resume', async (req, res) => {
  resume();
  await logAdminAction(req.user._id, 'agent.resume', 'agent', '');
  res.redirect('/admin');
});

// Admin actions log (P3 #29)
router.get('/actions', async (req, res, next) => {
  try {
    const { items, page, limit, total, pages } = await paginate(
      AdminAction.find({}).populate('adminId', 'email displayName').sort({ createdAt: -1 }),
      req.query.page,
      req.query.limit
    );
    res.render('admin/actions', {
      actions: items,
      pager: { page, limit, total, pages, base: '/admin/actions' },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
