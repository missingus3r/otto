import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { fileURLToPath } from 'url';

import requireAuth from '../middleware/requireAuth.js';
import Listing from '../models/Listing.js';
import Match from '../models/Match.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const mine = await Listing.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    const explore = await Listing.find({
      status: 'open',
      userId: { $ne: req.user._id },
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

    await Listing.create({
      userId: req.user._id,
      title,
      description,
      type,
      priceMin,
      priceMax,
      currency,
      swapForDescription,
      photoPath,
    });

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
    const matches = await Match.find({
      $or: [{ listingA: listing._id }, { listingB: listing._id }],
    })
      .sort({ createdAt: -1 })
      .lean();
    res.render('app/listing-detail', { listing, matches });
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

export default router;
