'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { loadPatientProfile } = require('../services/access');
const { refreshDueStatuses } = require('../services/medication');

const router = express.Router();
router.use(authenticate, requireRole('patient'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await refreshDueStatuses();
    const profile = await loadPatientProfile(req.user.id);
    const { page, limit, offset } = pagination(req, { limit: 30, max: 60 });
    const upcoming = String(req.query.upcoming || '') === '1';
    const extra = upcoming
      ? `AND s.status IN ('scheduled', 'upcoming', 'due')`
      : '';
    const order = upcoming
      ? 's.scheduled_date ASC, s.scheduled_time ASC'
      : 's.scheduled_date DESC, s.scheduled_time DESC';
    const count = await query(
      `SELECT COUNT(*)::int AS n FROM medication_schedules s WHERE s.patient_id = $1 ${extra}`,
      [profile.id]
    );
    const { rows } = await query(
      `SELECT s.*, m.medicine_name, m.dosage, m.frequency, m.instructions
       FROM medication_schedules s
       JOIN prescription_medicines m ON m.id = s.prescription_medicine_id
       WHERE s.patient_id = $1 ${extra}
       ORDER BY ${order}
       LIMIT $2 OFFSET $3`,
      [profile.id, limit, offset]
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

router.post(
  '/:id/taken',
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { rows } = await query(
      `UPDATE medication_schedules
       SET status = 'taken', taken_at = NOW()
       WHERE id = $1 AND patient_id = $2 AND status IN ('scheduled', 'upcoming', 'due', 'missed')
       RETURNING *`,
      [req.params.id, profile.id]
    );
    if (!rows[0]) fail(404, 'NOT_FOUND', 'Medication schedule not found.');
    await audit(req, 'MARK_MEDICATION_TAKEN', 'medication_schedule', rows[0].id);
    res.json({ success: true, data: { schedule: rows[0] } });
  })
);

module.exports = router;
