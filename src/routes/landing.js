import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  // if logged in, send to /listings
  if (req.session && req.session.userId) {
    return res.redirect('/listings');
  }
  res.render('landing');
});

router.get('/how-it-works', (req, res) => {
  res.render('app/how-it-works');
});

export default router;
