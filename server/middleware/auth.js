'use strict';

const jwt = require('jsonwebtoken');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');

function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function signUser(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function setAuthCookie(res, token) {
  res.cookie('medicare_token', token, cookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie('medicare_token', { ...cookieOptions(), maxAge: 0 });
}

async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.medicare_token;
    if (!token) fail(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      fail(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    const { rows } = await query(
      `SELECT id, name, email, role, email_verified, is_active FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows[0] || !rows[0].is_active) fail(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.medicare_token;
  if (!token) return next();
  authenticate(req, res, (err) => {
    if (err) {
      req.user = null;
      return next();
    }
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    try {
      if (!req.user) fail(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      if (!roles.includes(req.user.role)) fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  signUser,
  setAuthCookie,
  clearAuthCookie,
  authenticate,
  optionalAuth,
  requireRole
};
