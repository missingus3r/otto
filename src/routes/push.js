import express from 'express';

import requireAuth from '../middleware/requireAuth.js';
import { subscribe, unsubscribe } from '../services/push.js';

const router = express.Router();
router.use(requireAuth);

// Public VAPID key — the SW needs it to subscribe.
router.get('/key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

router.post('/subscribe', async (req, res, next) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) {
      return res.status(400).json({ ok: false, error: 'invalid subscription' });
    }
    await subscribe(req.user._id, sub, req.headers['user-agent'] || '');
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] subscribe error:', err);
    next(err);
  }
});

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (!endpoint) {
      return res.status(400).json({ ok: false, error: 'endpoint required' });
    }
    const removed = await unsubscribe(req.user._id, endpoint);
    res.json({ ok: true, removed });
  } catch (err) {
    next(err);
  }
});

export default router;
