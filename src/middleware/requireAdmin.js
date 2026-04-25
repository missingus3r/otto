import User from '../models/User.js';

export default async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.session) {
      req.session.flash = {
        type: 'error',
        message: res.locals.t ? res.locals.t('auth.required') : 'Login required',
      };
    }
    return res.redirect('/auth/login');
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user || user.banned || user.role !== 'admin') {
      return res.status(403).render('error', {
        status: 403,
        message: 'Forbidden',
      });
    }
    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
