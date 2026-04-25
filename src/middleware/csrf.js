// otto — CSRF middleware.
//
// 1) Lazily generate a token per session and expose it as res.locals.csrfToken
//    so views can render <input type="hidden" name="_csrf" value="..."/>.
// 2) On any state-changing method (POST/PUT/PATCH/DELETE), validate the body's
//    _csrf or the X-CSRF-Token header against the session token. Reject 403.
//
// Exemptions: routes whose paths start with any entry in EXEMPT_PREFIXES skip
// validation. Used for browser push subscribe (which sends JSON from the SW
// and would need a fetch to inject the token — we rely on requireAuth there).

import crypto from 'crypto';

const EXEMPT_PREFIXES = [
  '/push/subscribe',
  '/push/unsubscribe',
  // long-poll fetches read-only — but POSTs to /messages still validate
];

function ensureToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

export function csrfMiddleware(req, res, next) {
  const token = ensureToken(req);
  res.locals.csrfToken = token;

  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  // Exemptions — JSON push endpoints.
  const path = req.path || '';
  for (const p of EXEMPT_PREFIXES) {
    if (path.startsWith(p)) return next();
  }

  const supplied =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    '';

  if (!token || !supplied || String(supplied) !== String(token)) {
    console.warn(`[csrf] reject ${method} ${path} — token mismatch`);
    return res.status(403).render('error', {
      status: 403,
      message: 'Invalid CSRF token',
    });
  }

  return next();
}

export default csrfMiddleware;
