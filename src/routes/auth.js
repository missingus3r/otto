import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';

import User from '../models/User.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/listings');
  res.render('login', { error: null });
});

router.get('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/listings');
  res.render('register', { error: null });
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const displayName = clean(req.body.displayName) || email.split('@')[0];

    if (!email || !password || password.length < 6) {
      return res
        .status(400)
        .render('register', { error: 'Email/password required (password 6+ chars).' });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(400)
        .render('register', { error: res.locals.t('auth.exists') });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      passwordHash,
      displayName,
      role: 'user',
      lang: res.locals.lang || 'es',
      lastLoginAt: new Date(),
    });

    req.session.userId = String(user._id);
    req.session.flash = { type: 'success', message: res.locals.t('auth.welcome') };
    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });
    if (!user || user.banned) {
      return res
        .status(400)
        .render('login', { error: res.locals.t('auth.invalid') });
    }
    const ok = await user.comparePassword(password);
    if (!ok) {
      return res
        .status(400)
        .render('login', { error: res.locals.t('auth.invalid') });
    }
    user.lastLoginAt = new Date();
    await user.save();

    req.session.userId = String(user._id);
    req.session.flash = { type: 'success', message: res.locals.t('auth.welcome') };

    if (user.role === 'admin') return res.redirect('/admin');
    return res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default router;
