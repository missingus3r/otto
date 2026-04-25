import express from 'express';

import Listing from '../models/Listing.js';

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/listings');
  }
  res.render('landing');
});

router.get('/how-it-works', (req, res) => {
  res.render('app/how-it-works');
});

// Static legal pages (P3 #21)
router.get('/terms', (req, res) => {
  res.render('legal/terms');
});

router.get('/privacy', (req, res) => {
  res.render('legal/privacy');
});

// Sitemap (P3 #22)
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const listings = await Listing.find({ status: 'open', moderationStatus: 'approved' })
      .select('_id updatedAt')
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean();
    const urls = [
      { loc: `${APP_URL}/`, priority: '1.0' },
      { loc: `${APP_URL}/how-it-works`, priority: '0.7' },
      { loc: `${APP_URL}/terms`, priority: '0.3' },
      { loc: `${APP_URL}/privacy`, priority: '0.3' },
      ...listings.map((l) => ({
        loc: `${APP_URL}/listings/${l._id}`,
        lastmod: l.updatedAt ? l.updatedAt.toISOString() : undefined,
        priority: '0.6',
      })),
    ];
    res.set('Content-Type', 'application/xml');
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const u of urls) {
      xml += '  <url>\n';
      xml += `    <loc>${u.loc}</loc>\n`;
      if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
      if (u.priority) xml += `    <priority>${u.priority}</priority>\n`;
      xml += '  </url>\n';
    }
    xml += '</urlset>\n';
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

export default router;
