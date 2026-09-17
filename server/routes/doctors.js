'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { generateSlots, parseDate } = require('../services/slots');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req, { limit: 12, max: 24 });
    const q = String(req.query.q || '').trim();
    const spec = String(req.query.specialization || '').trim();
    const params = [];
    const where = [`dp.verification_status = 'verified'`, `u.is_active = TRUE`];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(u.name ILIKE $${params.length} OR dp.specialization ILIKE $${params.length} OR dp.bio ILIKE $${params.length})`);
    }
    if (spec) {
      params.push(spec);
      where.push(`dp.specialization ILIKE $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const count = await query(
      `SELECT COUNT(*)::int AS n
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE ${whereSql}`,
      params
    );
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT dp.id, u.name, dp.specialization, dp.qualification, dp.experience_years,
              dp.bio, dp.consultation_fee, dp.verification_status
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE ${whereSql}
       ORDER BY u.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT dp.id, u.name, dp.specialization, dp.qualification, dp.experience_years,
              dp.bio, dp.consultation_fee, dp.verification_status
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1 AND dp.verification_status = 'verified' AND u.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows[0]) fail(404, 'NOT_FOUND', 'Unable to load this doctor profile.');
    const availability = await query(
      `SELECT day_of_week, start_time, end_time, appointment_duration, appointment_type
       FROM doctor_availability
       WHERE doctor_id = $1 AND is_active = TRUE
       ORDER BY day_of_week, start_time`,
      [req.params.id]
    );
    res.json({ success: true, data: { doctor: rows[0], availability: availability.rows } });
  })
);

router.get(
  '/:id/slots',
  asyncHandler(async (req, res) => {
    const date = parseDate(req.query.date);
    if (!date) fail(400, 'INVALID', 'Please choose a valid date.');
    const doctor = await query(
      `SELECT dp.id FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1 AND dp.verification_status = 'verified' AND u.is_active = TRUE`,
      [req.params.id]
    );
    if (!doctor.rows[0]) fail(404, 'NOT_FOUND', 'Unable to load this doctor profile.');
    const slots = await generateSlots(req.params.id, date.stamp);
    res.json({ success: true, data: { date: date.stamp, slots } });
  })
);

module.exports = router;
