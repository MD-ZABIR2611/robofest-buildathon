'use strict';

const { query, withTransaction } = require('../utils/db');
const { notify } = require('./notify');
const { refreshDueStatuses } = require('./medication');

async function processReminders() {
  await refreshDueStatuses();
  let medications = 0;

  await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT id FROM medication_schedules
       WHERE status = 'due' AND reminder_sent_at IS NULL
       ORDER BY scheduled_date, scheduled_time
       LIMIT 50
       FOR UPDATE SKIP LOCKED`
    );
    if (!locked.rowCount) return;
    const ids = locked.rows.map((row) => row.id);
    const dueMeds = await client.query(
      `SELECT s.id, m.medicine_name, pp.user_id
       FROM medication_schedules s
       JOIN prescription_medicines m ON m.id = s.prescription_medicine_id
       JOIN patient_profiles pp ON pp.id = s.patient_id
       WHERE s.id = ANY($1::uuid[])`,
      [ids]
    );
    for (const row of dueMeds.rows) {
      const user = await client.query(`SELECT email FROM users WHERE id = $1`, [row.user_id]);
      await notify({
        userId: row.user_id,
        type: 'medication_reminder',
        title: 'Medication reminder',
        message: `It is time for a scheduled dose of ${row.medicine_name}.`,
        resourceType: 'medication_schedule',
        resourceId: row.id,
        emailTo: user.rows[0]?.email,
        emailText: 'You have a medication reminder in MediCare+. Sign in to mark the dose as taken.'
      });
      await client.query(`UPDATE medication_schedules SET reminder_sent_at = NOW() WHERE id = $1`, [row.id]);
      medications += 1;
    }
  });

  const upcoming = await query(
    `SELECT a.id, pp.user_id AS patient_user_id, dp.user_id AS doctor_user_id
     FROM appointments a
     JOIN patient_profiles pp ON pp.id = a.patient_id
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     WHERE a.status IN ('scheduled', 'confirmed')
       AND a.appointment_start BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.type = 'appointment_reminder' AND n.resource_id = a.id AND n.user_id = pp.user_id
       )
     LIMIT 50`
  );
  for (const row of upcoming.rows) {
    await notify({
      userId: row.patient_user_id,
      type: 'appointment_reminder',
      title: 'Appointment reminder',
      message: 'Your consultation begins soon. Open MediCare+ to prepare.',
      resourceType: 'appointment',
      resourceId: row.id
    });
    await notify({
      userId: row.doctor_user_id,
      type: 'appointment_reminder',
      title: 'Upcoming consultation',
      message: 'A consultation begins soon.',
      resourceType: 'appointment',
      resourceId: row.id
    });
  }

  return { medications, appointments: upcoming.rowCount };
}

module.exports = { processReminders };
