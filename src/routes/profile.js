import express from 'express';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Listing from '../models/Listing.js';
import Transaction from '../models/Transaction.js';

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
    res.render('app/profile', {
      listingsCount,
      dealsCount,
      saved: !!req.query.saved,
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
