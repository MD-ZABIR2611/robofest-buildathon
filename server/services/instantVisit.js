'use strict';

const { query } = require('../utils/db');
const { toDateStamp } = require('../utils/time');
const { applyDefaultClinicHours } = require('./clinicHours');

async function enableDoctorPrescribing(doctorId) {
  await query(
    `UPDATE doctor_profiles
     SET verification_status = 'verified', updated_at = NOW()
     WHERE id = $1`,
    [doctorId]
  );
  await applyDefaultClinicHours(doctorId);
}

async function cancelOpenInstantVisits({ doctorId, patientId }) {
  await query(
    `UPDATE appointments
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE doctor_id = $1
       AND ($2::uuid IS NULL OR patient_id = $2)
       AND reason LIKE 'Instant visit%'
       AND status NOT IN ('cancelled', 'no_show', 'completed')`,
    [doctorId, patientId || null]
  );
}

async function createInstantVisit({ patientId, doctorId, reason, type = 'Video' }) {
  await enableDoctorPrescribing(doctorId);
  await cancelOpenInstantVisits({ doctorId, patientId });

  const start = new Date();
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const stamp = toDateStamp(start);
  const visitReason = reason || 'Instant visit';

  async function insert() {
    const { rows } = await query(
      `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, appointment_start, appointment_end, type, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress')
       RETURNING *`,
      [patientId, doctorId, stamp, start.toISOString(), end.toISOString(), type, visitReason]
    );
    return rows[0];
  }

  try {
    return await insert();
  } catch (err) {
    if (err.code !== '23P01' && err.code !== '23505') throw err;
    await cancelOpenInstantVisits({ doctorId, patientId: null });
    return insert();
  }
}

module.exports = { enableDoctorPrescribing, createInstantVisit };
