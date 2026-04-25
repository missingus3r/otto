import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import { fileURLToPath } from 'url';

import requireAuth from '../middleware/requireAuth.js';
import Listing from '../models/Listing.js';
import Match from '../models/Match.js';
import { runAutoFlag } from '../services/moderation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const thumbsDir = path.join(uploadsDir, 'thumbs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
    const safe = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  },
});

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

// Fire-and-forget: 600x600 cover-fit webp thumbnail. Caller should NOT await.
async function generateThumb(srcAbsPath, outAbsPath) {
  await sharp(srcAbsPath)
    .resize(600, 600, { fit: 'cover', position: 'centre' })
    .webp({ quality: 78 })
    .toFile(outAbsPath);
}

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const mine = await Listing.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    const explore = await Listing.find({
      status: 'open',
      userId: { $ne: req.user._id },
      moderationStatus: 'approved',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.render('app/home', { mine, explore });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  res.render('app/new-listing', { error: null });
});

router.post('/', upload.single('photo'), async (req, res, next) => {
  try {
    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const type = ['sell', 'swap', 'buy'].includes(req.body.type) ? req.body.type : 'sell';
    const priceMin = Math.max(0, parseFloat(req.body.priceMin) || 0);
    const priceMax = Math.max(priceMin, parseFloat(req.body.priceMax) || priceMin);
    const currency = clean(req.body.currency).toUpperCase().slice(0, 6) || 'UYU';
    const swapForDescription = type === 'swap' ? clean(req.body.swapForDescription) : '';
    const photoPath = req.file ? `/uploads/${req.file.filename}` : '';

    if (!title) {
      return res.status(400).render('app/new-listing', { error: 'Title required' });
    }

    // Auto-flag heuristics — runs synchronously, cheap.
    const flag = runAutoFlag({ title, description, priceMin, priceMax });
    const moderationStatus = flag.flagged ? 'pending' : 'approved';

    const listing = await Listing.create({
      userId: req.user._id,
      title,
      description,
      type,
      priceMin,
      priceMax,
      currency,
      swapForDescription,
      photoPath,
      moderationStatus,
      flagged: flag.flagged,
      flagReason: flag.flagged ? `auto: ${flag.reason}` : '',
      flaggedAt: flag.flagged ? new Date() : undefined,
    });

    // Fire-and-forget thumbnail generation. Must NOT block the response.
    if (req.file) {
      const srcPath = path.join(uploadsDir, req.file.filename);
      const thumbName = `${path.parse(req.file.filename).name}.webp`;
      const thumbAbs = path.join(thumbsDir, thumbName);
      const thumbWeb = `/uploads/thumbs/${thumbName}`;
      generateThumb(srcPath, thumbAbs)
        .then(() =>
          Listing.updateOne({ _id: listing._id }, { $set: { thumbPath: thumbWeb } })
        )
        .catch((err) => console.error('[thumb]', err));
    }

    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('userId', 'displayName email').lean();
    if (!listing) {
      return res.status(404).render('error', { status: 404, message: res.locals.t('error.notFound') });
    }

    // Reputation of seller (best-effort).
    let sellerReputation = { avgRating: null, count: 0 };
    try {
      const User = (await import('../models/User.js')).default;
      const ownerId = listing.userId && (listing.userId._id || listing.userId);
      if (ownerId) sellerReputation = await User.reputationFor(ownerId);
    } catch (err) {
      console.warn('[listings] reputation lookup failed:', err.message);
    }

    const matches = await Match.find({
      $or: [{ listingA: listing._id }, { listingB: listing._id }],
    })
      .sort({ createdAt: -1 })
      .lean();
    res.render('app/listing-detail', { listing, matches, sellerReputation });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).render('error', { status: 404, message: 'Not found' });
    if (String(listing.userId) !== String(req.user._id)) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (listing.status === 'open' || listing.status === 'matched') {
      listing.status = 'cancelled';
      await listing.save();
    }
    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

// User-side flag: any logged-in user can flag a listing they find suspicious.
// Idempotent — flagging an already-flagged listing is a no-op.
router.post('/:id/flag', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).render('error', { status: 404, message: 'Not found' });
    if (listing.flagged) {
      return res.redirect(`/listings/${listing._id}`);
    }
    const reason = clean(req.body.reason).slice(0, 200) || 'user_flag';
    listing.flagged = true;
    listing.flaggedAt = new Date();
    listing.flagReason = `user:${String(req.user._id)}:${reason}`;
    await listing.save();
    res.redirect(`/listings/${listing._id}`);
  } catch (err) {
    next(err);
  }
});

export default router;
