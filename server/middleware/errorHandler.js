'use strict';

const { AppError } = require('../utils/errors');

function isDatabaseDown(err) {
  const code = err && err.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    (err && err.errors && err.errors.some((inner) => inner && inner.code === 'ECONNREFUSED'))
  );
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (isDatabaseDown(err)) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'Cannot reach the database. Start PostgreSQL, then try signing in again.'
      }
    });
  }
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : err.status || 500;
  const code = isApp ? err.code : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
  const message =
    status === 500
      ? 'Something went wrong. Please try again.'
      : err.message || 'Request failed.';
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    success: false,
    error: { code, message }
  });
}

function notFound(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found.' }
    });
  }
  res.status(404).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#0f172a}a{color:#0d9488}</style>
</head><body>
<main><h1>Page not found</h1><p>The page you requested is not available.</p>
<p><a href="/">Return home</a></p></main></body></html>`);
}

module.exports = { errorHandler, notFound };
