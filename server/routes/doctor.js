'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { loadDoctorProfile } = require('../services/access');

const router = express.Router();
router.use(authenticate, requireRole('doctor'));

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const profile = await loadDoctorProfile(req.user.id);
    const [upcoming, unread] = await Promise.all([
      query(
        `SELECT a.id, a.appointment_start, a.appointment_end, a.status, a.type, a.reason, u.name AS patient_name
         FROM appointments a
         JOIN patient_profiles pp ON pp.id = a.patient_id
         JOIN users u ON u.id = pp.user_id
         WHERE a.doctor_id = $1 AND a.status NOT IN ('cancelled', 'no_show')
         ORDER BY a.appointment_start DESC
         LIMIT 8`,
        [profile.id]
      ),
      query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = FALSE`, [req.user.id])
    ]);
    res.json({
      success: true,
      data: { profile, appointments: upcoming.rows, unread: unread.rows[0].n }
    });
  })
);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadDoctorProfile(req.user.id);
    const availability = await query(
      `SELECT * FROM doctor_availability WHERE doctor_id = $1 ORDER BY day_of_week, start_time`,
      [profile.id]
    );
    res.json({
      success: true,
      data: {
        user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
        profile,
        availability: availability.rows
      }
    });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadDoctorProfile(req.user.id);
    const { name, specialization, qualification, experience_years, bio, consultation_fee } = req.body || {};
    if (name && String(name).trim().length >= 2) {
      await query(`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`, [String(name).trim(), req.user.id]);
    }
    const { rows } = await query(
      `UPDATE doctor_profiles
       SET specialization = COALESCE($1, specialization),
           qualification = COALESCE($2, qualification),
           experience_years = COALESCE($3, experience_years),
           bio = COALESCE($4, bio),
           consultation_fee = COALESCE($5, consultation_fee),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        specialization || null,
        qualification || null,
        Number.isFinite(Number(experience_years)) ? Number(experience_years) : null,
        bio ?? null,
        consultation_fee == null ? null : Number(consultation_fee),
        profile.id
      ]
    );
    res.json({ success: true, data: { profile: rows[0] } });
  })
);

router.put(
  '/availability',
  asyncHandler(async (req, res) => {
    const profile = await loadDoctorProfile(req.user.id);
    const windows = Array.isArray(req.body?.windows) ? req.body.windows : [];
    if (!windows.length) fail(400, 'INVALID', 'Add at least one availability window.');
    await query(`DELETE FROM doctor_availability WHERE doctor_id = $1`, [profile.id]);
    for (const window of windows) {
      const day = Number(window.day_of_week);
      if (day < 0 || day > 6) continue;
      await query(
        `INSERT INTO doctor_availability
           (doctor_id, day_of_week, start_time, end_time, appointment_duration, appointment_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [
          profile.id,
          day,
          window.start_time,
          window.end_time,
          Number(window.appointment_duration) || 30,
          window.appointment_type === 'In-person' ? 'In-person' : 'Video'
        ]
      );
    }
    const availability = await query(
      `SELECT * FROM doctor_availability WHERE doctor_id = $1 ORDER BY day_of_week, start_time`,
      [profile.id]
    );
    res.json({ success: true, data: { availability: availability.rows } });
  })
);

module.exports = router;
