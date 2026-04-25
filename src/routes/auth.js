import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';

import User from '../models/User.js';
import { sendMail } from '../services/email.js';
import { tForLang } from '../services/i18n.js';

const router = express.Router();

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerificationEmail(user, lang) {
  const url = `${APP_URL}/auth/verify/${user.emailVerifyToken}`;
  const subject = tForLang(lang, 'verify.subject');
  const text = tForLang(lang, 'verify.body', { url });
  await sendMail({ to: user.email, subject, text });
}

async function sendPasswordResetEmail(user, lang) {
  const url = `${APP_URL}/auth/reset/${user.passwordResetToken}`;
  const subject = tForLang(lang, 'verify.resetSubject');
  const text = tForLang(lang, 'verify.resetBody', { url });
  await sendMail({ to: user.email, subject, text });
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
    const lang = res.locals.lang || 'es';
    const emailVerifyToken = genToken();
    const emailVerifyExpiresAt = new Date(Date.now() + 7 * 86400 * 1000);

    const user = await User.create({
      email,
      passwordHash,
      displayName,
      role: 'user',
      lang,
      lastLoginAt: new Date(),
      emailVerified: false,
      emailVerifyToken,
      emailVerifyExpiresAt,
    });

    // best-effort send
    try {
      await sendVerificationEmail(user, lang);
    } catch (e) {
      console.error('[email] verification send failed:', e.message);
    }

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
    if (!user) {
      return res
        .status(400)
        .render('login', { error: res.locals.t('auth.invalid') });
    }
    if (user.banned || (user.bannedUntil && user.bannedUntil.getTime() > Date.now())) {
      return res
        .status(400)
        .render('login', { error: res.locals.t('auth.banned') });
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

// ─────────── password reset by email ───────────

router.get('/forgot', (req, res) => {
  res.render('forgot', { error: null, sent: false });
});

router.post('/forgot', forgotLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    if (email) {
      const user = await User.findOne({ email });
      if (user) {
        user.passwordResetToken = genToken();
        user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();
        try {
          await sendPasswordResetEmail(user, user.lang || res.locals.lang || 'es');
        } catch (e) {
          console.error('[email] reset send failed:', e.message);
        }
      } else {
        console.log(`[email] forgot for unknown email=${email}`);
      }
    }
    // generic answer always
    res.render('forgot', { error: null, sent: true });
  } catch (err) {
    next(err);
  }
});

router.get('/reset/:token', async (req, res, next) => {
  try {
    const user = await User.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res
        .status(400)
        .render('reset', { error: res.locals.t('auth.resetExpired'), token: '', valid: false });
    }
    res.render('reset', { error: null, token: user.passwordResetToken, valid: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reset/:token', authLimiter, async (req, res, next) => {
  try {
    const user = await User.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res
        .status(400)
        .render('reset', { error: res.locals.t('auth.resetExpired'), token: '', valid: false });
    }
    const password = String(req.body.password || '');
    if (password.length < 6) {
      return res.status(400).render('reset', {
        error: 'Min 6 chars',
        token: user.passwordResetToken,
        valid: true,
      });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    req.session.userId = String(user._id);
    req.session.flash = { type: 'success', message: res.locals.t('auth.welcome') };
    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

// ─────────── email verification ───────────

router.get('/verify/:token', async (req, res, next) => {
  try {
    const user = await User.findOne({
      emailVerifyToken: req.params.token,
      emailVerifyExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      if (req.session) {
        req.session.flash = { type: 'error', message: res.locals.t('verify.invalid') };
      }
      return res.redirect('/listings');
    }
    user.emailVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpiresAt = null;
    await user.save();
    if (req.session) {
      req.session.flash = { type: 'success', message: res.locals.t('verify.success') };
    }
    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

router.post('/verify/resend', authLimiter, async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) return res.redirect('/auth/login');
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/auth/login');
    if (user.emailVerified) return res.redirect('/listings');
    user.emailVerifyToken = genToken();
    user.emailVerifyExpiresAt = new Date(Date.now() + 7 * 86400 * 1000);
    await user.save();
    try {
      await sendVerificationEmail(user, user.lang || 'es');
    } catch (e) {
      console.error('[email] verify resend failed:', e.message);
    }
    req.session.flash = { type: 'success', message: res.locals.t('verify.changeSent') };
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Email change confirmation (P3 #25): user clicks link in NEW mailbox.
router.get('/verify-email/:token', async (req, res, next) => {
  try {
    const user = await User.findOne({
      pendingEmailToken: req.params.token,
      pendingEmailExpiresAt: { $gt: new Date() },
    });
    if (!user || !user.pendingEmail) {
      if (req.session) {
        req.session.flash = { type: 'error', message: res.locals.t('verify.invalid') };
      }
      return res.redirect('/profile');
    }
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.pendingEmailToken = null;
    user.pendingEmailExpiresAt = null;
    user.emailVerified = true;
    await user.save();
    if (req.session) {
      req.session.flash = { type: 'success', message: res.locals.t('verify.changed') };
    }
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

export default router;
