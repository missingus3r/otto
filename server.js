import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

import { connectDB } from './src/config/db.js';
import User from './src/models/User.js';
import { i18nMiddleware } from './src/middleware/i18n.js';
import { startAgentCron } from './src/services/agent.js';

import landingRoutes from './src/routes/landing.js';
import authRoutes from './src/routes/auth.js';
import listingsRoutes from './src/routes/listings.js';
import matchesRoutes from './src/routes/matches.js';
import profileRoutes from './src/routes/profile.js';
import adminRoutes from './src/routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrapAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.warn('[bootstrap] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin bootstrap');
    return;
  }
  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log('[bootstrap] admin user already exists:', existing.email);
    return;
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await User.create({
    email: adminEmail,
    passwordHash,
    displayName: 'Admin',
    role: 'admin',
    lang: process.env.DEFAULT_LANG || 'es',
  });
  console.log('[bootstrap] admin user created:', admin.email);
}

async function start() {
  try {
    await connectDB();
    await bootstrapAdmin();

    if (process.env.AGENT_ENABLED === 'true') {
      startAgentCron();
    } else {
      console.log('[agent] disabled by env (AGENT_ENABLED != true)');
    }

    const app = express();

    // ensure uploads dir exists
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // security middleware — relaxed CSP so inline EJS scripts work without CDN.
    // upgradeInsecureRequests + HSTS disabled because we serve over plain HTTP
    // in dev/LAN; otherwise the browser upgrades /css/main.css to https://
    // and the connection refuses, leaving the page unstyled.
    const isProd = process.env.NODE_ENV === 'production';
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: false,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            ...(isProd ? { upgradeInsecureRequests: [] } : {}),
          },
        },
        hsts: isProd,
        crossOriginEmbedderPolicy: false,
      })
    );

    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // sessions backed by mongo
    app.use(
      session({
        secret: process.env.SESSION_SECRET || 'dealr-dev-secret',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
          mongoUrl: process.env.MONGO_URI,
          collectionName: 'sessions',
          ttl: 60 * 60 * 24 * 14, // 14 days
        }),
        cookie: {
          maxAge: 1000 * 60 * 60 * 24 * 14,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        },
      })
    );

    // view engine
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    // static
    app.use(express.static(path.join(__dirname, 'public')));

    // i18n
    app.use(i18nMiddleware);

    // make session info available to views
    app.use((req, res, next) => {
      res.locals.session = req.session;
      res.locals.currentUser = req.user || null;
      next();
    });

    // routes
    app.use('/', landingRoutes);
    app.use('/auth', authRoutes);
    app.use('/listings', listingsRoutes);
    app.use('/matches', matchesRoutes);
    app.use('/profile', profileRoutes);
    app.use('/admin', adminRoutes);

    // 404
    app.use((req, res) => {
      res.status(404).render('error', {
        status: 404,
        message: res.locals.t ? res.locals.t('error.notFound') : 'Not found',
      });
    });

    // error handler
    app.use((err, req, res, next) => {
      console.error('[error]', err);
      res.status(err.status || 500).render('error', {
        status: err.status || 500,
        message:
          err.message ||
          (res.locals.t ? res.locals.t('error.serverError') : 'Server error'),
      });
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`[dealr] listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('[fatal] startup failed:', err);
    process.exit(1);
  }
}

start();
