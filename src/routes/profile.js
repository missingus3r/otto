import express from 'express';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Listing from '../models/Listing.js';
import Transaction from '../models/Transaction.js';
import Review from '../models/Review.js';
import User from '../models/User.js';

const router = express.Router();
router.use(requireAuth);

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

router.get('/', async (req, res, next) => {
  try {
    const listingsCount = await Listing.countDocuments({ userId: req.user._id });
    const dealsCount = await Transaction.countDocuments({
      $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
      status: 'completed',
    });

    const reputation = await User.reputationFor(req.user._id);

    // Reviews left to/for me, for the partial.
    const [received, left] = await Promise.all([
      Review.find({ toUserId: req.user._id })
        .populate('fromUserId', 'displayName email')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Review.find({ fromUserId: req.user._id })
        .populate('toUserId', 'displayName email')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    res.render('app/profile', {
      listingsCount,
      dealsCount,
      saved: !!req.query.saved,
      reputation,
      reviewsReceived: received,
      reviewsLeft: left,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const displayName = clean(req.body.displayName).slice(0, 80);
    const lang = ['es', 'pt', 'en'].includes(req.body.lang) ? req.body.lang : req.user.lang;
    req.user.displayName = displayName || req.user.displayName;
    req.user.lang = lang;
    await req.user.save();
    if (req.session) req.session.lang = lang;
    res.redirect('/profile?saved=1');
  } catch (err) {
    next(err);
  }
});

export default router;
