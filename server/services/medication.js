'use strict';

const { query } = require('../utils/db');
const { parseDurationDays, timesForFrequency } = require('../utils/time');

async function generateSchedules(client, { patientId, medicineId, frequency, duration, startDate }) {
  const days = parseDurationDays(duration);
  const times = timesForFrequency(frequency);
  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);
  const values = [];
  const params = [];
  let i = 1;
  for (let day = 0; day < days; day += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const time of times) {
      values.push(`($${i++}, $${i++}, $${i++}, $${i++}, 'scheduled')`);
      params.push(patientId, medicineId, stamp, time);
    }
  }
  if (!values.length) return;
  await client.query(
    `INSERT INTO medication_schedules
       (patient_id, prescription_medicine_id, scheduled_date, scheduled_time, status)
     VALUES ${values.join(', ')}
     ON CONFLICT (prescription_medicine_id, scheduled_date, scheduled_time) DO NOTHING`,
    params
  );
}

async function refreshDueStatuses() {
  await query(
    `UPDATE medication_schedules
     SET status = 'due'
     WHERE status IN ('scheduled', 'upcoming')
       AND (scheduled_date + scheduled_time) <= NOW()
       AND (scheduled_date + scheduled_time) > NOW() - INTERVAL '2 hours'`
  );
  await query(
    `UPDATE medication_schedules
     SET status = 'upcoming'
     WHERE status = 'scheduled'
       AND scheduled_date = CURRENT_DATE
       AND (scheduled_date + scheduled_time) > NOW()
       AND (scheduled_date + scheduled_time) <= NOW() + INTERVAL '2 hours'`
  );
  await query(
    `UPDATE medication_schedules
     SET status = 'missed'
     WHERE status IN ('scheduled', 'upcoming', 'due')
       AND (scheduled_date + scheduled_time) < NOW() - INTERVAL '2 hours'`
  );
}

module.exports = { generateSchedules, refreshDueStatuses };
