'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [users, doctors, appointments, prescriptions] = await Promise.all([
      query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role`),
      query(
        `SELECT verification_status, COUNT(*)::int AS n FROM doctor_profiles GROUP BY verification_status`
      ),
      query(`SELECT COUNT(*)::int AS n FROM appointments WHERE status NOT IN ('cancelled')`),
      query(`SELECT COUNT(*)::int AS n FROM prescriptions`)
    ]);
    res.json({
      success: true,
      data: {
        users: users.rows,
        doctors: doctors.rows,
        appointments: appointments.rows[0].n,
        prescriptions: prescriptions.rows[0].n
      }
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req, { limit: 20, max: 50 });
    const role = String(req.query.role || '').trim();
    const params = [];
    const extra = [];
    if (role && ['patient', 'doctor', 'admin'].includes(role)) {
      params.push(role);
      extra.push(`role = $${params.length}`);
    }
    const where = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*)::int AS n FROM users ${where}`, params);
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT id, name, email, role, email_verified, is_active, created_at, last_login_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

router.patch(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) fail(400, 'INVALID', 'You cannot deactivate your own admin account.');
    const isActive = Boolean(req.body?.is_active);
    const { rows } = await query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND role <> 'admin'
       RETURNING id, name, email, role, is_active`,
      [isActive, req.params.id]
    );
    if (!rows[0]) fail(404, 'NOT_FOUND', 'Account not found.');
    await audit(req, isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'user', rows[0].id);
    res.json({ success: true, data: { user: rows[0] } });
  })
);

router.get(
  '/doctors',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req);
    const status = String(req.query.status || '').trim();
    const params = [];
    const extra = [];
    if (['pending', 'verified', 'rejected', 'suspended'].includes(status)) {
      params.push(status);
      extra.push(`dp.verification_status = $${params.length}`);
    }
    const where = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*)::int AS n
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       ${where}`,
      params
    );
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT dp.id, dp.specialization, dp.license_number, dp.qualification, dp.verification_status,
              dp.created_at, u.id AS user_id, u.name, u.email, u.is_active
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       ${where}
       ORDER BY dp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

router.patch(
  '/doctors/:id/verification',
  asyncHandler(async (req, res) => {
    const status = String(req.body?.verification_status || '').trim();
    if (!['pending', 'verified', 'rejected', 'suspended'].includes(status)) {
      fail(400, 'INVALID', 'Choose a valid verification status.');
    }
    const { rows } = await query(
      `UPDATE doctor_profiles
       SET verification_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, user_id, verification_status, specialization`,
      [status, req.params.id]
    );
    if (!rows[0]) fail(404, 'NOT_FOUND', 'Doctor profile not found.');
    await audit(req, 'VERIFY_DOCTOR', 'doctor_profile', rows[0].id);
    res.json({ success: true, data: { doctor: rows[0] } });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req, { limit: 30, max: 50 });
    const count = await query(`SELECT COUNT(*)::int AS n FROM audit_logs`);
    const { rows } = await query(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.ip_address, a.created_at,
              u.name, u.role, u.email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

module.exports = router;
