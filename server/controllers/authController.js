'use strict';

const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { hashPassword, verifyPassword, randomToken, hashToken } = require('../utils/crypto');
const { signUser, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { sendMail, publicBase } = require('../services/mail');
const { loadDoctorProfile, loadPatientProfile } = require('../services/access');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: user.email_verified
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

function mailConfigured() {
  return Boolean(process.env.EMAIL_HOST);
}

async function completeSignupSession(res, user, verifiedMessage, verifyMessage, verifyUrl) {
  if (!mailConfigured()) {
    await query(`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, [user.id]);
    user.email_verified = true;
    setAuthCookie(res, signUser(user));
    return res.status(201).json({
      success: true,
      data: { user: publicUser(user), signed_in: true, message: verifiedMessage }
    });
  }
  return res.status(201).json({
    success: true,
    data: {
      user: publicUser(user),
      message: verifyMessage,
      verify_url: process.env.NODE_ENV === 'development' ? verifyUrl : undefined
    }
  });
}

async function issueEmailToken(userId, purpose, hours) {
  const token = randomToken();
  await query(
    `INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval)`,
    [userId, hashToken(token), purpose, String(hours)]
  );
  return token;
}

async function me(req, res) {
  if (!req.user) return res.json({ success: true, data: { user: null } });
  let profile = null;
  if (req.user.role === 'patient') {
    const p = await query(`SELECT * FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
    profile = p.rows[0] || null;
  } else if (req.user.role === 'doctor') {
    const p = await query(`SELECT * FROM doctor_profiles WHERE user_id = $1`, [req.user.id]);
    profile = p.rows[0] || null;
  }
  res.json({ success: true, data: { user: publicUser(req.user), profile } });
}

async function registerPatient(req, res) {
  const { name, email, password } = req.body || {};
  if (req.body) delete req.body.role;
  if (!name || String(name).trim().length < 2) fail(400, 'INVALID', 'Please enter your full name.');
  if (!validateEmail(email)) fail(400, 'INVALID', 'Please enter a valid email address.');
  if (!validatePassword(password)) fail(400, 'INVALID', 'Password must be at least 8 characters.');
  const hash = await hashPassword(password);
  let user;
  try {
    const inserted = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, 'patient')
       RETURNING id, name, email, role, email_verified`,
      [String(name).trim(), email, hash]
    );
    user = inserted.rows[0];
    await query(`INSERT INTO patient_profiles (user_id) VALUES ($1)`, [user.id]);
  } catch (err) {
    if (err.code === '23505') fail(409, 'EXISTS', 'An account with this email already exists.');
    throw err;
  }
  const token = await issueEmailToken(user.id, 'verify_email', 48);
  const verifyUrl = `${publicBase()}/patient/login.html?verify=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your MediCare+ email',
    text: `Welcome to MediCare+. Confirm your email using this link: ${verifyUrl}`
  });
  await completeSignupSession(
    res,
    user,
    'Account created. You are signed in.',
    'Account created. Please verify your email to continue.',
    verifyUrl
  );
}

async function registerDoctor(req, res) {
  const { name, email, password, specialization, license_number, qualification, experience_years, bio } =
    req.body || {};
  if (req.body) delete req.body.role;
  if (!name || String(name).trim().length < 2) fail(400, 'INVALID', 'Please enter your full name.');
  if (!validateEmail(email)) fail(400, 'INVALID', 'Please enter a valid email address.');
  if (!validatePassword(password)) fail(400, 'INVALID', 'Password must be at least 8 characters.');
  if (!license_number) fail(400, 'INVALID', 'A medical license number is required.');
  const hash = await hashPassword(password);
  let user;
  try {
    const inserted = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, 'doctor')
       RETURNING id, name, email, role, email_verified`,
      [String(name).trim(), email, hash]
    );
    user = inserted.rows[0];
    await query(
      `INSERT INTO doctor_profiles
         (user_id, specialization, license_number, qualification, experience_years, bio, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [
        user.id,
        String(specialization || 'General Practice').trim(),
        String(license_number).trim(),
        qualification || null,
        Number.parseInt(experience_years, 10) || 0,
        bio || null
      ]
    );
  } catch (err) {
    if (err.code === '23505') fail(409, 'EXISTS', 'An account with this email already exists.');
    throw err;
  }
  const token = await issueEmailToken(user.id, 'verify_email', 48);
  const verifyUrl = `${publicBase()}/doctor/login.html?verify=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your MediCare+ clinician email',
    text: `Thank you for applying to MediCare+. Confirm your email: ${verifyUrl}. Your profile remains pending review until verification is complete.`
  });
  await completeSignupSession(
    res,
    user,
    'Application received. You are signed in. Booking stays off until review.',
    'Application received. Verify your email. Your profile will appear after review.',
    verifyUrl
  );
}

async function verifyEmail(req, res) {
  const token = req.body?.token || req.query.token;
  if (!token) fail(400, 'INVALID', 'Verification token is missing.');
  const { rows } = await query(
    `SELECT * FROM email_tokens
     WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    fail(400, 'INVALID', 'This verification link is invalid or has expired.');
  }
  await query(`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, [row.user_id]);
  await query(`UPDATE email_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
  res.json({ success: true, data: { message: 'Email verified. You can sign in now.' } });
}

async function resendVerification(req, res) {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!validateEmail(email)) fail(400, 'INVALID', 'Please enter a valid email address.');
  const { rows } = await query(`SELECT id, email, email_verified, role FROM users WHERE LOWER(email) = $1`, [email]);
  const user = rows[0];
  if (user && !user.email_verified) {
    const token = await issueEmailToken(user.id, 'verify_email', 48);
    const path = user.role === 'doctor' ? '/doctor/login.html' : '/patient/login.html';
    const verifyUrl = `${publicBase()}${path}?verify=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Verify your MediCare+ email',
      text: `Confirm your email using this link: ${verifyUrl}`
    });
  }
  res.json({ success: true, data: { message: 'If an unverified account exists, a new email has been sent.' } });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (req.body) delete req.body.role;
  if (!validateEmail(email) || !password) fail(400, 'INVALID', 'Email and password are required.');
  const { rows } = await query(
    `SELECT id, name, email, password_hash, role, email_verified, is_active FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }
  if (!user.is_active) fail(403, 'INACTIVE', 'This account is no longer active.');
  if (!user.email_verified && mailConfigured()) {
    fail(403, 'UNVERIFIED', 'Please verify your email before signing in.');
  }
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
  const token = signUser(user);
  setAuthCookie(res, token);
  req.user = user;
  await audit(req, 'LOGIN', 'user', user.id);
  res.json({ success: true, data: { user: publicUser(user) } });
}

async function logout(req, res) {
  await audit(req, 'LOGOUT', 'user', req.user.id);
  clearAuthCookie(res);
  res.json({ success: true, data: { message: 'Signed out.' } });
}

async function forgotPassword(req, res) {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!validateEmail(email)) fail(400, 'INVALID', 'Please enter a valid email address.');
  const { rows } = await query(`SELECT id, email, role FROM users WHERE LOWER(email) = $1`, [email]);
  const user = rows[0];
  if (user) {
    const token = await issueEmailToken(user.id, 'reset_password', 2);
    const path = user.role === 'doctor' ? '/doctor/login.html' : '/patient/login.html';
    const resetUrl = `${publicBase()}${path}?reset=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your MediCare+ password',
      text: `Use this link to choose a new password: ${resetUrl}. It expires in 2 hours.`
    });
  }
  res.json({
    success: true,
    data: { message: 'If an account exists, password reset instructions have been sent.' }
  });
}

async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  if (!token) fail(400, 'INVALID', 'Reset token is missing.');
  if (!validatePassword(password)) fail(400, 'INVALID', 'Password must be at least 8 characters.');
  const { rows } = await query(
    `SELECT * FROM email_tokens
     WHERE token_hash = $1 AND purpose = 'reset_password' AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    fail(400, 'INVALID', 'This reset link is invalid or has expired.');
  }
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, row.user_id]);
  await query(`UPDATE email_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
  res.json({ success: true, data: { message: 'Password updated. You can sign in now.' } });
}

async function patientContext(req, res) {
  if (req.user.role !== 'patient') fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  const profile = await loadPatientProfile(req.user.id);
  res.json({ success: true, data: { profile } });
}

async function doctorContext(req, res) {
  if (req.user.role !== 'doctor') fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  const profile = await loadDoctorProfile(req.user.id);
  res.json({ success: true, data: { profile } });
}

module.exports = {
  me,
  registerPatient,
  registerDoctor,
  verifyEmail,
  resendVerification,
  login,
  logout,
  forgotPassword,
  resetPassword,
  patientContext,
  doctorContext
};
