'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query, withTransaction } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notify } = require('../services/notify');
const { generateSlots } = require('../services/slots');
const { toDateStamp } = require('../utils/time');
const { loadDoctorProfile, loadPatientProfile, describeAccess, requireConsultationWindow } = require('../services/access');
const { issuePrescription } = require('../controllers/prescriptionController');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req);
    const status = String(req.query.status || '').trim();
    let rows;
    let total;
    if (req.user.role === 'patient') {
      const profile = await loadPatientProfile(req.user.id);
      const params = [profile.id];
      const extra = status ? 'AND a.status = $2' : '';
      if (status) params.push(status);
      const count = await query(
        `SELECT COUNT(*)::int AS n FROM appointments a WHERE a.patient_id = $1 ${extra}`,
        params
      );
      total = count.rows[0].n;
      params.push(limit, offset);
      const result = await query(
        `SELECT a.*, u.name AS doctor_name, dp.specialization
         FROM appointments a
         JOIN doctor_profiles dp ON dp.id = a.doctor_id
         JOIN users u ON u.id = dp.user_id
         WHERE a.patient_id = $1 ${extra}
         ORDER BY a.appointment_start DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      rows = result.rows;
    } else if (req.user.role === 'doctor') {
      const profile = await loadDoctorProfile(req.user.id);
      const params = [profile.id];
      const extra = status ? 'AND a.status = $2' : '';
      if (status) params.push(status);
      const count = await query(
        `SELECT COUNT(*)::int AS n FROM appointments a WHERE a.doctor_id = $1 ${extra}`,
        params
      );
      total = count.rows[0].n;
      params.push(limit, offset);
      const result = await query(
        `SELECT a.*, u.name AS patient_name
         FROM appointments a
         JOIN patient_profiles pp ON pp.id = a.patient_id
         JOIN users u ON u.id = pp.user_id
         WHERE a.doctor_id = $1 ${extra}
         ORDER BY a.appointment_start DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      rows = result.rows;
    } else {
      fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
    res.json({ success: true, data: paginated(rows, total, { page, limit }) });
  })
);

router.post(
  '/',
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { doctor_id, start, type, reason } = req.body || {};
    if (!doctor_id || !start) fail(400, 'INVALID', 'Please choose a doctor and appointment time.');
    const startAt = new Date(start);
    if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) {
      fail(400, 'INVALID', 'Please choose a valid future appointment time.');
    }
    const doctor = await query(
      `SELECT dp.* FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1 AND dp.verification_status = 'verified' AND u.is_active = TRUE`,
      [doctor_id]
    );
    if (!doctor.rows[0]) fail(400, 'INVALID', 'This doctor is not available for booking.');
    const dateStamp = toDateStamp(startAt);
    const slots = await generateSlots(doctor_id, dateStamp);
    const match = slots.find((slot) => new Date(slot.start).getTime() === startAt.getTime());
    if (!match) {
      fail(409, 'SLOT_TAKEN', 'This appointment slot is no longer available. Please choose another time.');
    }
    const apptType = type === 'In-person' ? 'In-person' : match.type === 'In-person' ? 'In-person' : 'Video';
    let created;
    try {
      created = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO appointments
             (patient_id, doctor_id, appointment_date, appointment_start, appointment_end, type, reason, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed')
           RETURNING *`,
          [profile.id, doctor_id, dateStamp, match.start, match.end, apptType, reason || null]
        );
        return inserted.rows[0];
      });
    } catch (err) {
      if (err.code === '23P01' || err.code === '23505') {
        fail(409, 'SLOT_TAKEN', 'This appointment slot is no longer available. Please choose another time.');
      }
      throw err;
    }
    await audit(req, 'CREATE_APPOINTMENT', 'appointment', created.id);
    const doctorUser = await query(`SELECT user_id FROM doctor_profiles WHERE id = $1`, [doctor_id]);
    await notify({
      userId: req.user.id,
      type: 'appointment_confirmed',
      title: 'Appointment confirmed',
      message: 'Your appointment is confirmed. You will receive a reminder before it begins.',
      resourceType: 'appointment',
      resourceId: created.id,
      emailTo: req.user.email,
      emailText: 'Your MediCare+ appointment is confirmed. Sign in to view the details.'
    });
    await notify({
      userId: doctorUser.rows[0].user_id,
      type: 'appointment_new',
      title: 'New appointment',
      message: 'A patient has booked a consultation with you.',
      resourceType: 'appointment',
      resourceId: created.id
    });
    res.status(201).json({ success: true, data: { appointment: created } });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.*,
              du.name AS doctor_name, dp.specialization, dp.user_id AS doctor_user_id,
              pu.name AS patient_name, pp.user_id AS patient_user_id
       FROM appointments a
       JOIN doctor_profiles dp ON dp.id = a.doctor_id
       JOIN users du ON du.id = dp.user_id
       JOIN patient_profiles pp ON pp.id = a.patient_id
       JOIN users pu ON pu.id = pp.user_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    const appointment = rows[0];
    if (!appointment) fail(404, 'NOT_FOUND', 'Appointment not found.');
    const allowed =
      (req.user.role === 'patient' && appointment.patient_user_id === req.user.id) ||
      (req.user.role === 'doctor' && appointment.doctor_user_id === req.user.id);
    if (!allowed) fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
    const payload = { ...appointment };
    if (req.user.role !== 'doctor') {
      delete payload.patient_user_id;
    }
    res.json({ success: true, data: { appointment: payload } });
  })
);

router.get(
  '/:id/access',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const access = await describeAccess(req.params.id, req.user.id);
    res.json({ success: true, data: access });
  })
);

router.get(
  '/:id/patient-summary',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const { appointment } = await requireConsultationWindow(req.params.id, req.user.id);
    await audit(req, 'VIEW_PATIENT_HISTORY', 'appointment', appointment.id);
    const profile = await query(
      `SELECT date_of_birth, phone, emergency_contact_name, emergency_contact_phone
       FROM patient_profiles WHERE id = $1`,
      [appointment.patient_id]
    );
    const history = await query(
      `SELECT id, record_type, summary, created_at
       FROM medical_history
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [appointment.patient_id]
    );
    res.json({
      success: true,
      data: {
        patient: {
          name: appointment.patient_name,
          date_of_birth: profile.rows[0]?.date_of_birth || null,
          phone: profile.rows[0]?.phone || null,
          emergency_contact_name: profile.rows[0]?.emergency_contact_name || null,
          emergency_contact_phone: profile.rows[0]?.emergency_contact_phone || null
        },
        history: history.rows
      }
    });
  })
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.*, pp.user_id AS patient_user_id, dp.user_id AS doctor_user_id
       FROM appointments a
       JOIN patient_profiles pp ON pp.id = a.patient_id
       JOIN doctor_profiles dp ON dp.id = a.doctor_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    const appointment = rows[0];
    if (!appointment) fail(404, 'NOT_FOUND', 'Appointment not found.');
    const allowed =
      (req.user.role === 'patient' && appointment.patient_user_id === req.user.id) ||
      (req.user.role === 'doctor' && appointment.doctor_user_id === req.user.id);
    if (!allowed) fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      fail(400, 'INVALID', 'This appointment can no longer be cancelled.');
    }
    if (new Date(appointment.appointment_start) <= new Date()) {
      fail(400, 'INVALID', 'This appointment can no longer be cancelled.');
    }
    const { rows: updated } = await query(
      `UPDATE appointments
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [appointment.id]
    );
    res.json({ success: true, data: { appointment: updated[0] } });
  })
);

router.post(
  '/:id/reschedule',
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    const profile = await loadPatientProfile(req.user.id);
    const { start } = req.body || {};
    const { rows } = await query(`SELECT * FROM appointments WHERE id = $1 AND patient_id = $2`, [
      req.params.id,
      profile.id
    ]);
    const appointment = rows[0];
    if (!appointment) fail(404, 'NOT_FOUND', 'Appointment not found.');
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      fail(400, 'INVALID', 'This appointment can no longer be rescheduled.');
    }
    const startAt = new Date(start);
    if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) {
      fail(400, 'INVALID', 'Please choose a valid future appointment time.');
    }
    const dateStamp = toDateStamp(startAt);
    const slots = await generateSlots(appointment.doctor_id, dateStamp);
    const match = slots.find((slot) => new Date(slot.start).getTime() === startAt.getTime());
    if (!match) {
      fail(409, 'SLOT_TAKEN', 'This appointment slot is no longer available. Please choose another time.');
    }
    try {
      const { rows: updated } = await query(
        `UPDATE appointments
         SET appointment_date = $1, appointment_start = $2, appointment_end = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [dateStamp, match.start, match.end, appointment.id]
      );
      res.json({ success: true, data: { appointment: updated[0] } });
    } catch (err) {
      if (err.code === '23P01') {
        fail(409, 'SLOT_TAKEN', 'This appointment slot is no longer available. Please choose another time.');
      }
      throw err;
    }
  })
);

router.post(
  '/:id/start',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const { appointment } = await requireConsultationWindow(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE appointments SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [appointment.id]
    );
    await audit(req, 'START_CONSULTATION', 'appointment', appointment.id);
    res.json({ success: true, data: { appointment: rows[0] } });
  })
);

router.post(
  '/:id/prescriptions',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const { appointment } = await requireConsultationWindow(req.params.id, req.user.id);
    const existing = await query(`SELECT id FROM consultations WHERE appointment_id = $1`, [appointment.id]);
    let consultationId = existing.rows[0]?.id;
    if (!consultationId) {
      const inserted = await query(
        `INSERT INTO consultations (appointment_id, patient_id, doctor_id, diagnosis, doctor_notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          appointment.id,
          appointment.patient_id,
          appointment.doctor_id,
          req.body?.diagnosis || null,
          req.body?.notes || null
        ]
      );
      consultationId = inserted.rows[0].id;
    }
    const prescription = await issuePrescription(req, consultationId, req.body);
    res.status(201).json({ success: true, data: { prescription } });
  })
);

module.exports = router;
