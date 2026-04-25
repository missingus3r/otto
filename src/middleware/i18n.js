import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED = ['es', 'pt', 'en'];

const translations = {};
for (const lang of SUPPORTED) {
  const p = path.join(__dirname, '..', 'i18n', `${lang}.json`);
  try {
    translations[lang] = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn(`[i18n] could not load ${lang}.json:`, err.message);
    translations[lang] = {};
  }
}

function pickLang(req) {
  if (req.query && req.query.lang && SUPPORTED.includes(req.query.lang)) {
    if (req.session) req.session.lang = req.query.lang;
    return req.query.lang;
  }
  if (req.session && req.session.lang && SUPPORTED.includes(req.session.lang)) {
    return req.session.lang;
  }
  if (req.user && req.user.lang && SUPPORTED.includes(req.user.lang)) {
    return req.user.lang;
  }
  const accept = req.headers['accept-language'];
  if (accept) {
    const first = accept.split(',')[0].trim().slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(first)) return first;
  }
  return process.env.DEFAULT_LANG && SUPPORTED.includes(process.env.DEFAULT_LANG)
    ? process.env.DEFAULT_LANG
    : 'es';
}

export function i18nMiddleware(req, res, next) {
  const lang = pickLang(req);
  res.locals.lang = lang;
  res.locals.supportedLangs = SUPPORTED;
  res.locals.t = (key) => {
    const dict = translations[lang] || {};
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    const fallback = translations.es || {};
    if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
    return key;
  };
  next();
}

export default i18nMiddleware;
