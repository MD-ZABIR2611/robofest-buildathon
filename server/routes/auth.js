'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const auth = require('../controllers/authController');

const router = express.Router();

router.get('/me', optionalAuth, asyncHandler(auth.me));
router.post('/register-patient', authLimiter, asyncHandler(auth.registerPatient));
router.post('/register-doctor', authLimiter, asyncHandler(auth.registerDoctor));
router.post('/verify-email', asyncHandler(auth.verifyEmail));
router.post('/resend-verification', authLimiter, asyncHandler(auth.resendVerification));
router.post('/login', authLimiter, asyncHandler(auth.login));
router.post('/logout', authenticate, asyncHandler(auth.logout));
router.post('/forgot-password', authLimiter, asyncHandler(auth.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(auth.resetPassword));
router.get('/patient-context', authenticate, asyncHandler(auth.patientContext));
router.get('/doctor-context', authenticate, asyncHandler(auth.doctorContext));

module.exports = router;
