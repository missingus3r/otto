// Standalone i18n helper usable from background services (no req/res).
// Loads the same JSON files used by the express middleware once at import time.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const I18N_DIR = path.join(__dirname, '..', 'i18n');

const dictionaries = {};
for (const lang of ['es', 'pt', 'en']) {
  try {
    const raw = fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8');
    dictionaries[lang] = JSON.parse(raw);
  } catch (e) {
    console.error(`[i18n] failed to load ${lang}.json:`, e.message);
    dictionaries[lang] = {};
  }
}

const FALLBACK_LANG = process.env.DEFAULT_LANG || 'es';

export function tForLang(lang, key, params) {
  const dict = dictionaries[lang] || dictionaries[FALLBACK_LANG] || {};
  let str = dict[key];
  if (str === undefined) {
    str = (dictionaries[FALLBACK_LANG] || {})[key];
  }
  if (str === undefined) return key;
  if (params && typeof str === 'string') {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function availableLangs() {
  return Object.keys(dictionaries);
}
