'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { fail } = require('./utils/errors');
const { mountApi } = require('./routes');

const app = express();
const root = path.join(__dirname, '..');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const allowed = (process.env.CLIENT_URL || '').replace(/\/$/, '');
  if (origin) {
    const normalized = origin.replace(/\/$/, '');
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.get('host');
    } catch {
      sameHost = false;
    }
    if (allowed && normalized !== allowed && !sameHost) {
      try {
        fail(403, 'CSRF', 'Request origin is not allowed.');
      } catch (err) {
        return next(err);
      }
    }
  }
  next();
});

mountApi(app);

const staticOpts = { dotfiles: 'deny', index: false, fallthrough: true };
app.use('/css', express.static(path.join(root, 'css'), { ...staticOpts, maxAge: '1d' }));
app.use('/js', express.static(path.join(root, 'js'), { ...staticOpts, maxAge: '1h' }));
app.use('/patient', express.static(path.join(root, 'patient'), staticOpts));
app.use('/doctor', express.static(path.join(root, 'doctor'), staticOpts));
app.use('/admin', express.static(path.join(root, 'admin'), staticOpts));
app.use('/doctors', express.static(path.join(root, 'doctors'), { ...staticOpts, index: 'index.html' }));
app.use('/docs', express.static(path.join(root, 'docs'), staticOpts));
app.get('/doctors', (req, res) => res.redirect('/doctors/'));
app.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.sendFile(path.join(root, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.sendFile(path.join(root, 'index.html'));
});
['how-it-works.html', 'security.html', 'privacy.html', 'terms.html'].forEach((file) => {
  app.get(`/${file}`, (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.sendFile(path.join(root, file));
  });
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
