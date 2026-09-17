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
  '/overview',
  asyncHandler(async (req, res) => {
    await refreshDueStatuses();
    const profile = await loadPatientProfile(req.user.id);
    const [appointments, medications, notifications, unread, latestRx] = await Promise.all([
      query(
        `SELECT a.id, a.appointment_start, a.appointment_end, a.status, a.type, u.name AS doctor_name
         FROM appointments a
         JOIN doctor_profiles dp ON dp.id = a.doctor_id
         JOIN users u ON u.id = dp.user_id
         WHERE a.patient_id = $1
         ORDER BY a.appointment_start DESC
         LIMIT 5`,
        [profile.id]
      ),
      query(
        `SELECT s.id, s.scheduled_date, s.scheduled_time, s.status, m.medicine_name, m.dosage
         FROM medication_schedules s
         JOIN prescription_medicines m ON m.id = s.prescription_medicine_id
         WHERE s.patient_id = $1 AND s.status IN ('scheduled', 'upcoming', 'due')
         ORDER BY s.scheduled_date, s.scheduled_time
         LIMIT 6`,
        [profile.id]
      ),
      query(
        `SELECT id, title, message, created_at, read
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [req.user.id]
      ),
      query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = FALSE`, [req.user.id]),
      query(
        `SELECT p.id, p.created_at, p.notes, p.status, u.name AS doctor_name
         FROM prescriptions p
         JOIN doctor_profiles dp ON dp.id = p.doctor_id
         JOIN users u ON u.id = dp.user_id
         WHERE p.patient_id = $1
         ORDER BY p.created_at DESC
         LIMIT 1`,
        [profile.id]
      )
    ]);
    let latestPrescription = latestRx.rows[0] || null;
    if (latestPrescription) {
      const meds = await query(
        `SELECT medicine_name, dosage, frequency, duration FROM prescription_medicines WHERE prescription_id = $1`,
        [latestPrescription.id]
      );
      latestPrescription = { ...latestPrescription, medicines: meds.rows };
    }
    res.json({
      success: true,
      data: {
        appointments: appointments.rows,
        medications: medications.rows,
        nextMedication: medications.rows[0] || null,
        latestPrescription,
        notifications: notifications.rows,
        unread: unread.rows[0].n
      }
    });
  })
);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    res.json({
      success: true,
      data: {
        user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
        profile
      }
    });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { name, date_of_birth, phone, address, emergency_contact_name, emergency_contact_phone } = req.body || {};
    if (name && String(name).trim().length >= 2) {
      await query(`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`, [String(name).trim(), req.user.id]);
    }
    const { rows } = await query(
      `UPDATE patient_profiles
       SET date_of_birth = COALESCE($1, date_of_birth),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           emergency_contact_name = COALESCE($4, emergency_contact_name),
           emergency_contact_phone = COALESCE($5, emergency_contact_phone),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        date_of_birth || null,
        phone ?? null,
        address ?? null,
        emergency_contact_name ?? null,
        emergency_contact_phone ?? null,
        profile.id
      ]
    );
    res.json({ success: true, data: { profile: rows[0] } });
  })
);

router.get(
  '/medications',
  asyncHandler(async (req, res) => {
    await refreshDueStatuses();
    const profile = await loadPatientProfile(req.user.id);
    const { page, limit, offset } = pagination(req, { limit: 30, max: 60 });
    const count = await query(`SELECT COUNT(*)::int AS n FROM medication_schedules WHERE patient_id = $1`, [
      profile.id
    ]);
    const { rows } = await query(
      `SELECT s.*, m.medicine_name, m.dosage, m.frequency, m.instructions
       FROM medication_schedules s
       JOIN prescription_medicines m ON m.id = s.prescription_medicine_id
       WHERE s.patient_id = $1
       ORDER BY s.scheduled_date DESC, s.scheduled_time DESC
       LIMIT $2 OFFSET $3`,
      [profile.id, limit, offset]
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

router.post(
  '/medications/:id/taken',
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

router.post(
  '/medications/:id/skipped',
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { rows } = await query(
      `UPDATE medication_schedules
       SET status = 'skipped'
       WHERE id = $1 AND patient_id = $2 AND status IN ('scheduled', 'upcoming', 'due')
       RETURNING *`,
      [req.params.id, profile.id]
    );
    if (!rows[0]) fail(404, 'NOT_FOUND', 'Medication schedule not found.');
    res.json({ success: true, data: { schedule: rows[0] } });
  })
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { page, limit, offset } = pagination(req);
    const count = await query(`SELECT COUNT(*)::int AS n FROM medical_history WHERE patient_id = $1`, [profile.id]);
    const { rows } = await query(
      `SELECT id, record_type, summary, consultation_id, prescription_id, created_at
       FROM medical_history
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [profile.id, limit, offset]
    );
    res.json({ success: true, data: paginated(rows, count.rows[0].n, { page, limit }) });
  })
);

module.exports = router;
