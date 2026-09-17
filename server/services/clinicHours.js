'use strict';

const { query } = require('../utils/db');

async function applyDefaultClinicHours(doctorId, exec = query) {
  const existing = await exec(`SELECT COUNT(*)::int AS n FROM doctor_availability WHERE doctor_id = $1`, [doctorId]);
  if (existing.rows[0].n > 0) return;
  for (const day of [1, 2, 3, 4, 5]) {
    await exec(
      `INSERT INTO doctor_availability
         (doctor_id, day_of_week, start_time, end_time, appointment_duration, appointment_type)
       VALUES ($1, $2, '09:00', '17:00', 30, 'Video')`,
      [doctorId, day]
    );
  }
  await exec(
    `INSERT INTO doctor_availability
       (doctor_id, day_of_week, start_time, end_time, appointment_duration, appointment_type)
     VALUES ($1, 6, '09:00', '13:00', 30, 'Video')`,
    [doctorId]
  );
}

async function makeDoctorBookable(userId) {
  const { rows } = await query(
    `UPDATE doctor_profiles
     SET verification_status = 'verified', updated_at = NOW()
     WHERE user_id = $1
     RETURNING id`,
    [userId]
  );
  if (rows[0]) await applyDefaultClinicHours(rows[0].id);
  return rows[0] || null;
}

async function makeAllDoctorsBookable() {
  await query(
    `UPDATE doctor_profiles
     SET verification_status = 'verified', updated_at = NOW()
     WHERE verification_status IN ('pending', 'rejected')`
  );
  const { rows } = await query(`SELECT id FROM doctor_profiles`);
  for (const row of rows) {
    await applyDefaultClinicHours(row.id);
  }
}

module.exports = { applyDefaultClinicHours, makeDoctorBookable, makeAllDoctorsBookable };
