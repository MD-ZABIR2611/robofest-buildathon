'use strict';

const { query } = require('../utils/db');
const { fail } = require('../utils/errors');

async function loadDoctorProfile(userId) {
  const { rows } = await query(`SELECT * FROM doctor_profiles WHERE user_id = $1`, [userId]);
  if (!rows[0]) fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
  return rows[0];
}

async function loadPatientProfile(userId) {
  const { rows } = await query(`SELECT * FROM patient_profiles WHERE user_id = $1`, [userId]);
  if (!rows[0]) fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
  return rows[0];
}

function accessState(appointment, now = new Date()) {
  if (appointment.status === 'in_progress') return 'during';
  const start = new Date(appointment.appointment_start);
  const end = new Date(appointment.appointment_end);
  const chartOpen = new Date(start.getTime() - 15 * 60 * 1000);
  const chartClose = new Date(end.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (now < chartOpen) return 'before';
  if (now >= chartClose) return 'after';
  return 'during';
}

function accessMessage(state) {
  if (state === 'before') {
    return 'The chart opens 15 minutes before the visit. You can then save notes and issue a prescription.';
  }
  if (state === 'after') {
    return 'The documentation window for this visit has closed.';
  }
  return 'You can review this patient chart and issue a digital prescription.';
}

async function loadAppointmentForDoctor(appointmentId, doctorProfileId) {
  const { rows } = await query(
    `SELECT a.*,
            pp.user_id AS patient_user_id,
            pu.name AS patient_name,
            pu.email AS patient_email,
            dp.user_id AS doctor_user_id
     FROM appointments a
     JOIN patient_profiles pp ON pp.id = a.patient_id
     JOIN users pu ON pu.id = pp.user_id
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     WHERE a.id = $1`,
    [appointmentId]
  );
  const appointment = rows[0];
  if (!appointment) fail(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.doctor_id !== doctorProfileId) {
    fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
  }
  if (['cancelled', 'no_show'].includes(appointment.status)) {
    fail(403, 'FORBIDDEN', 'You are not authorized to access this information.');
  }
  return appointment;
}

async function requireConsultationWindow(appointmentId, doctorUserId) {
  const doctor = await loadDoctorProfile(doctorUserId);
  const appointment = await loadAppointmentForDoctor(appointmentId, doctor.id);
  const state = accessState(appointment);
  if (state !== 'during') {
    fail(403, 'ACCESS_WINDOW', accessMessage(state));
  }
  return { doctor, appointment, state };
}

async function describeAccess(appointmentId, doctorUserId) {
  const doctor = await loadDoctorProfile(doctorUserId);
  const appointment = await loadAppointmentForDoctor(appointmentId, doctor.id);
  const state = accessState(appointment);
  return {
    state,
    allowed: state === 'during',
    message: accessMessage(state),
    appointment: {
      id: appointment.id,
      status: appointment.status,
      type: appointment.type,
      reason: appointment.reason,
      appointment_start: appointment.appointment_start,
      appointment_end: appointment.appointment_end,
      patient_name: appointment.patient_name
    }
  };
}

module.exports = {
  loadDoctorProfile,
  loadPatientProfile,
  accessState,
  accessMessage,
  loadAppointmentForDoctor,
  requireConsultationWindow,
  describeAccess
};
