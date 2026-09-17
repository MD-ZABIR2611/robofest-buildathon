'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const { query } = require('../utils/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireConsultationWindow } = require('../services/access');
const { createForConsultation } = require('../controllers/prescriptionController');

const router = express.Router();
router.use(authenticate);

router.post(
  '/appointments/:id/consultation',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const { appointment } = await requireConsultationWindow(req.params.id, req.user.id);
    const { symptoms, chief_complaint, diagnosis, doctor_notes, treatment_plan, follow_up_instructions } =
      req.body || {};
    const existing = await query(`SELECT * FROM consultations WHERE appointment_id = $1`, [appointment.id]);
    let consultation;
    if (existing.rows[0]) {
      const { rows } = await query(
        `UPDATE consultations
         SET symptoms = $1, chief_complaint = $2, diagnosis = $3, doctor_notes = $4,
             treatment_plan = $5, follow_up_instructions = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          symptoms || null,
          chief_complaint || null,
          diagnosis || null,
          doctor_notes || null,
          treatment_plan || null,
          follow_up_instructions || null,
          existing.rows[0].id
        ]
      );
      consultation = rows[0];
    } else {
      const { rows } = await query(
        `INSERT INTO consultations
           (appointment_id, patient_id, doctor_id, symptoms, chief_complaint, diagnosis,
            doctor_notes, treatment_plan, follow_up_instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          appointment.id,
          appointment.patient_id,
          appointment.doctor_id,
          symptoms || null,
          chief_complaint || null,
          diagnosis || null,
          doctor_notes || null,
          treatment_plan || null,
          follow_up_instructions || null
        ]
      );
      consultation = rows[0];
      await query(
        `INSERT INTO medical_history (patient_id, consultation_id, record_type, summary)
         VALUES ($1, $2, 'consultation', $3)`,
        [
          appointment.patient_id,
          consultation.id,
          diagnosis ? `Consultation recorded: ${diagnosis}` : 'Consultation recorded.'
        ]
      );
    }
    res.json({ success: true, data: { consultation } });
  })
);

router.get(
  '/appointments/:id/consultation',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.*, a.status AS appointment_status, dp.user_id AS doctor_user_id, pp.user_id AS patient_user_id
       FROM consultations c
       JOIN appointments a ON a.id = c.appointment_id
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       JOIN patient_profiles pp ON pp.id = c.patient_id
       WHERE c.appointment_id = $1`,
      [req.params.id]
    );
    const consultation = rows[0];
    if (!consultation) fail(404, 'NOT_FOUND', 'Consultation not found.');
    if (req.user.role === 'patient' && consultation.patient_user_id !== req.user.id) {
      fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
    }
    if (req.user.role === 'doctor') {
      if (consultation.doctor_user_id !== req.user.id) {
        fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
      }
      await requireConsultationWindow(req.params.id, req.user.id);
    }
    res.json({ success: true, data: { consultation } });
  })
);

router.post('/consultations/:id/prescriptions', requireRole('doctor'), asyncHandler(createForConsultation));

module.exports = router;
