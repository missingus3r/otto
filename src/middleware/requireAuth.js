import User from '../models/User.js';

export default async function requireAuth(req, res, next) {
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
    if (!user || user.banned) {
      req.session.destroy(() => {});
      return res.redirect('/auth/login');
    }
    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
