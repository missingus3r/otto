import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

import requireAuth from '../middleware/requireAuth.js';
import Listing, { CATEGORIES } from '../models/Listing.js';
import Match from '../models/Match.js';
import { runAutoFlag } from '../services/moderation.js';
import { checkImage } from '../services/imageModeration.js';

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

// 10 listings created / hour / IP
const createListingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}

async function generateThumb(srcAbsPath, outAbsPath) {
  await sharp(srcAbsPath)
    .resize(600, 600, { fit: 'cover', position: 'centre' })
    .webp({ quality: 78 })
    .toFile(outAbsPath);
}

// Process one uploaded file → return {path, thumbPath}, generating thumb async.
function attachPhotoMeta(file) {
  const photoPath = `/uploads/${file.filename}`;
  const thumbName = `${path.parse(file.filename).name}.webp`;
  const thumbWeb = `/uploads/thumbs/${thumbName}`;
  const thumbAbs = path.join(thumbsDir, thumbName);
  const srcPath = path.join(uploadsDir, file.filename);
  // fire-and-forget thumbnail generation
  generateThumb(srcPath, thumbAbs).catch((err) => console.error('[thumb]', err));
  return { path: photoPath, thumbPath: thumbWeb, srcAbs: srcPath };
}

async function maybeNsfwCheck(srcAbs, listingId) {
  try {
    const r = await checkImage(srcAbs);
    if (r.flagged) {
      console.log(`[nsfw] flagged listing=${listingId} reason=${r.reason}`);
      await Listing.updateOne(
        { _id: listingId },
        {
          $set: {
            flagged: true,
            flaggedAt: new Date(),
            flagReason: `auto: nsfw:${r.reason}`,
          },
        }
      );
    }
  } catch (e) {
    console.warn('[nsfw] check error:', e.message);
  }
}

function safeUnlink(absPath) {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (e) {
    console.warn('[gallery] unlink failed:', e.message);
  }
}

const router = express.Router();
router.use(requireAuth);

// Index — list mine + explore (with optional search filters via query string).
router.get('/', async (req, res, next) => {
  try {
    const q = clean(req.query.q || '').slice(0, 80);
    const type = ['sell', 'swap', 'buy'].includes(req.query.type) ? req.query.type : '';
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const city = clean(req.query.city || '').slice(0, 80);
    const min = req.query.min !== undefined ? parseFloat(req.query.min) : NaN;
    const max = req.query.max !== undefined ? parseFloat(req.query.max) : NaN;

    const mine = await Listing.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();

    const exploreFilter = {
      status: 'open',
      userId: { $ne: req.user._id },
      moderationStatus: 'approved',
    };
    if (type) exploreFilter.type = type;
    if (category) exploreFilter.category = category;
    if (city) exploreFilter.city = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (Number.isFinite(min) && min > 0) exploreFilter.priceMax = { $gte: min };
    if (Number.isFinite(max) && max > 0) {
      exploreFilter.priceMin = Object.assign({}, exploreFilter.priceMin || {}, { $lte: max });
    }
    if (q) exploreFilter.$text = { $search: q };

    console.log(
      `[search] q="${q}" type=${type} cat=${category} city=${city} min=${min} max=${max}`
    );

    const explore = await Listing.find(exploreFilter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.render('app/home', {
      mine,
      explore,
      filters: { q, type, category, city, min: Number.isFinite(min) ? min : '', max: Number.isFinite(max) ? max : '' },
      categories: CATEGORIES,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  if (!req.user.emailVerified) {
    return res.render('app/new-listing', {
      error: null,
      blocked: true,
      categories: CATEGORIES,
    });
  }
  res.render('app/new-listing', { error: null, blocked: false, categories: CATEGORIES });
});

// CREATE — multiple photos (max 6). Block if email not verified.
router.post('/', createListingLimiter, upload.array('photos', 6), async (req, res, next) => {
  try {
    if (!req.user.emailVerified) {
      // delete any uploaded files
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res.status(403).render('app/new-listing', {
        error: res.locals.t('verify.required'),
        blocked: true,
        categories: CATEGORIES,
      });
    }

    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const type = ['sell', 'swap', 'buy'].includes(req.body.type) ? req.body.type : 'sell';
    const priceMin = Math.max(0, parseFloat(req.body.priceMin) || 0);
    const priceMax = Math.max(priceMin, parseFloat(req.body.priceMax) || priceMin);
    const currency = clean(req.body.currency).toUpperCase().slice(0, 6) || 'UYU';
    const swapForDescription = type === 'swap' ? clean(req.body.swapForDescription) : '';
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'otros';
    const city = clean(req.body.city || '').slice(0, 80) || (req.user.city || '');

    if (!title) {
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res
        .status(400)
        .render('app/new-listing', { error: 'Title required', blocked: false, categories: CATEGORIES });
    }

    // Photos
    const files = (req.files || []).slice(0, 6);
    const photoMetas = files.map((f, i) => {
      const m = attachPhotoMeta(f);
      return { path: m.path, thumbPath: m.thumbPath, order: i, srcAbs: m.srcAbs };
    });

    // Auto-flag heuristics
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
      category,
      city,
      photos: photoMetas.map((p) => ({ path: p.path, thumbPath: p.thumbPath, order: p.order })),
      photoPath: photoMetas[0] ? photoMetas[0].path : '',
      thumbPath: photoMetas[0] ? photoMetas[0].thumbPath : null,
      moderationStatus,
      flagged: flag.flagged,
      flagReason: flag.flagged ? `auto: ${flag.reason}` : '',
      flaggedAt: flag.flagged ? new Date() : undefined,
    });

    // NSFW image moderation — fire and forget for the original of each photo.
    for (const p of photoMetas) {
      maybeNsfwCheck(p.srcAbs, listing._id);
    }

    res.redirect('/listings');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('userId', 'displayName email city')
      .lean();
    if (!listing) {
      return res.status(404).render('error', { status: 404, message: res.locals.t('error.notFound') });
    }

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

// EDIT (owner only, status=open)
router.get('/:id/edit', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).render('error', { status: 404, message: 'Not found' });
    if (String(listing.userId) !== String(req.user._id)) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (listing.status !== 'open') {
      req.session.flash = { type: 'error', message: 'Only open listings can be edited' };
      return res.redirect(`/listings/${listing._id}`);
    }
    res.render('app/edit-listing', {
      listing: listing.toObject(),
      error: null,
      categories: CATEGORIES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/edit', upload.array('photos', 6), async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res.status(404).render('error', { status: 404, message: 'Not found' });
    }
    if (String(listing.userId) !== String(req.user._id)) {
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (listing.status !== 'open') {
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res.status(400).render('error', { status: 400, message: 'Only open listings editable' });
    }

    const title = clean(req.body.title);
    const description = clean(req.body.description);
    const priceMin = Math.max(0, parseFloat(req.body.priceMin) || 0);
    const priceMax = Math.max(priceMin, parseFloat(req.body.priceMax) || priceMin);
    const currency = clean(req.body.currency).toUpperCase().slice(0, 6) || listing.currency;
    const swapForDescription =
      listing.type === 'swap' ? clean(req.body.swapForDescription) : listing.swapForDescription;
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : listing.category;
    const city = clean(req.body.city || '').slice(0, 80) || listing.city;

    if (!title) {
      for (const f of req.files || []) safeUnlink(path.join(uploadsDir, f.filename));
      return res.status(400).render('app/edit-listing', {
        listing: listing.toObject(),
        error: 'Title required',
        categories: CATEGORIES,
      });
    }

    listing.title = title;
    listing.description = description;
    listing.priceMin = priceMin;
    listing.priceMax = priceMax;
    listing.currency = currency;
    listing.swapForDescription = swapForDescription;
    listing.category = category;
    listing.city = city;

    // If new photos uploaded → replace all old ones.
    const newFiles = req.files || [];
    if (newFiles.length) {
      // delete old photos from disk
      const allOldPaths = [];
      for (const p of listing.photos || []) {
        allOldPaths.push(p.path);
        if (p.thumbPath) allOldPaths.push(p.thumbPath);
      }
      if (listing.photoPath && !allOldPaths.includes(listing.photoPath)) allOldPaths.push(listing.photoPath);
      if (listing.thumbPath && !allOldPaths.includes(listing.thumbPath)) allOldPaths.push(listing.thumbPath);
      for (const webPath of allOldPaths) {
        const abs = path.join(__dirname, '..', '..', 'public', webPath.replace(/^\//, ''));
        safeUnlink(abs);
      }
      const photoMetas = newFiles.map((f, i) => {
        const m = attachPhotoMeta(f);
        return { path: m.path, thumbPath: m.thumbPath, order: i, srcAbs: m.srcAbs };
      });
      listing.photos = photoMetas.map((p) => ({ path: p.path, thumbPath: p.thumbPath, order: p.order }));
      listing.photoPath = photoMetas[0].path;
      listing.thumbPath = photoMetas[0].thumbPath;
      for (const p of photoMetas) maybeNsfwCheck(p.srcAbs, listing._id);
    }

    // Re-run auto-flag heuristics on changed text/price
    const flag = runAutoFlag({ title, description, priceMin, priceMax });
    if (flag.flagged) {
      listing.flagged = true;
      listing.flaggedAt = new Date();
      listing.flagReason = `auto: ${flag.reason}`;
      listing.moderationStatus = 'pending';
    }

    await listing.save();
    res.redirect(`/listings/${listing._id}`);
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

// Moderation appeal (P3 #26).
router.post('/:id/appeal', async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).render('error', { status: 404, message: 'Not found' });
    if (String(listing.userId) !== String(req.user._id)) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }
    if (listing.moderationStatus !== 'rejected') {
      return res.status(400).render('error', { status: 400, message: 'Only rejected listings can be appealed' });
    }
    listing.appealReason = clean(req.body.reason).slice(0, 500);
    listing.appealAt = new Date();
    await listing.save();
    console.log(`[appeal] listing=${listing._id} reason="${listing.appealReason.slice(0, 60)}"`);
    req.session.flash = { type: 'success', message: res.locals.t('listings.appealSent') };
    res.redirect(`/listings/${listing._id}`);
  } catch (err) {
    next(err);
  }
});

export default router;
