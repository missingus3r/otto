import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';

import requireAuth from '../middleware/requireAuth.js';
import Listing from '../models/Listing.js';
import Transaction from '../models/Transaction.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { sendMail } from '../services/email.js';
import { tForLang } from '../services/i18n.js';

const router = express.Router();
router.use(requireAuth);

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const ACCOUNT_DELETION_GRACE_DAYS = parseInt(
  process.env.ACCOUNT_DELETION_GRACE_DAYS || '7',
  10
);

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

router.get('/', async (req, res, next) => {
  try {
    const listingsCount = await Listing.countDocuments({ userId: req.user._id });
    const dealsCount = await Transaction.countDocuments({
      $or: [{ buyerId: req.user._id }, { sellerId: req.user._id }],
      status: 'completed',
    });

    const reputation = await User.reputationFor(req.user._id);

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
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const displayName = clean(req.body.displayName).slice(0, 80);
    const lang = ['es', 'pt', 'en', 'fr', 'it'].includes(req.body.lang) ? req.body.lang : req.user.lang;
    const city = clean(req.body.city || '').slice(0, 80);
    const country = clean(req.body.country || '').slice(0, 2).toUpperCase();
    req.user.displayName = displayName || req.user.displayName;
    req.user.lang = lang;
    req.user.city = city;
    if (country) req.user.country = country;
    // Push prefs (checkbox values)
    req.user.pushPrefs = {
      matches: !!req.body.pushMatches,
      messages: !!req.body.pushMessages,
      reviews: !!req.body.pushReviews,
    };
    await req.user.save();
    if (req.session) req.session.lang = lang;
    res.redirect('/profile?saved=1');
  } catch (err) {
    next(err);
  }
});

// Change password (P3 #24)
router.post('/password', async (req, res, next) => {
  try {
    const current = String(req.body.currentPassword || '');
    const next1 = String(req.body.newPassword || '');
    const confirm = String(req.body.confirmPassword || '');
    if (!current || !next1 || next1 !== confirm || next1.length < 6) {
      req.session.flash = { type: 'error', message: res.locals.t('profile.passwordWrong') };
      return res.redirect('/profile');
    }
    const ok = await req.user.comparePassword(current);
    if (!ok) {
      req.session.flash = { type: 'error', message: res.locals.t('profile.passwordWrong') };
      return res.redirect('/profile');
    }
    req.user.passwordHash = await bcrypt.hash(next1, 10);
    await req.user.save();
    req.session.flash = { type: 'success', message: res.locals.t('profile.passwordChanged') };
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Change email (P3 #25)
router.post('/email', async (req, res, next) => {
  try {
    const newEmail = clean(req.body.newEmail || '').toLowerCase();
    if (!newEmail || !/^[^@\s]+@[^@\s]+$/.test(newEmail)) {
      req.session.flash = { type: 'error', message: 'Invalid email' };
      return res.redirect('/profile');
    }
    if (newEmail === req.user.email) {
      return res.redirect('/profile');
    }
    const exists = await User.findOne({ email: newEmail });
    if (exists) {
      req.session.flash = { type: 'error', message: res.locals.t('auth.exists') };
      return res.redirect('/profile');
    }
    req.user.pendingEmail = newEmail;
    req.user.pendingEmailToken = genToken();
    req.user.pendingEmailExpiresAt = new Date(Date.now() + 7 * 86400 * 1000);
    await req.user.save();
    const lang = req.user.lang || 'es';
    const url = `${APP_URL}/auth/verify-email/${req.user.pendingEmailToken}`;
    try {
      await sendMail({
        to: newEmail,
        subject: tForLang(lang, 'verify.changeSubject'),
        text: tForLang(lang, 'verify.body', { url }),
      });
    } catch (e) {
      console.error('[email] change send failed:', e.message);
    }
    req.session.flash = { type: 'success', message: res.locals.t('verify.changeSent') };
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Account deletion request (P1 #11)
router.post('/delete', async (req, res, next) => {
  try {
    const confirm = String(req.body.confirm || '').trim().toUpperCase();
    if (confirm !== 'ELIMINAR') {
      req.session.flash = { type: 'error', message: 'Confirmation mismatch' };
      return res.redirect('/profile');
    }
    req.user.deletionRequestedAt = new Date();
    await req.user.save();
    console.log(`[deletion] requested user=${req.user._id}`);
    req.session.flash = { type: 'success', message: res.locals.t('profile.deleteRequested') };
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

export default router;
