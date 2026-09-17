'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { processReminders } = require('../services/reminders');

const router = express.Router();

router.all(
  '/reminders',
  asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.secret;
    if (!secret || token !== secret) {
      fail(401, 'UNAUTHENTICATED', 'You are not authorized to access this information.');
    }
    const result = await processReminders();
    res.json({ success: true, data: result });
  })
);

module.exports = router;
