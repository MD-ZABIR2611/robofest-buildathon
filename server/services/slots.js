'use strict';

const { query } = require('../utils/db');
const { addMinutes, toTimeStamp, fromClinicLocal, clinicDayOfWeek } = require('../utils/time');

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, stamp: `${match[1]}-${match[2]}-${match[3]}` };
}

async function generateSlots(doctorId, dateStamp) {
  const parsed = parseDate(dateStamp);
  if (!parsed) return [];
  const dayOfWeek = clinicDayOfWeek(parsed.stamp);
  const { rows: windows } = await query(
    `SELECT * FROM doctor_availability
     WHERE doctor_id = $1 AND day_of_week = $2 AND is_active = TRUE
     ORDER BY start_time`,
    [doctorId, dayOfWeek]
  );
  const { rows: booked } = await query(
    `SELECT appointment_start, appointment_end
     FROM appointments
     WHERE doctor_id = $1
       AND appointment_date = $2
       AND status NOT IN ('cancelled', 'no_show')`,
    [doctorId, parsed.stamp]
  );
  const now = new Date();
  const slots = [];
  for (const window of windows) {
    const [sh, sm] = String(window.start_time).split(':').map(Number);
    const [eh, em] = String(window.end_time).split(':').map(Number);
    let cursor = fromClinicLocal(parsed.stamp, sh, sm);
    const end = fromClinicLocal(parsed.stamp, eh, em);
    const duration = Number(window.appointment_duration) || 30;
    while (addMinutes(cursor, duration) <= end) {
      const slotEnd = addMinutes(cursor, duration);
      const overlaps = booked.some((row) => {
        const start = new Date(row.appointment_start);
        const stop = new Date(row.appointment_end);
        return cursor < stop && slotEnd > start;
      });
      if (!overlaps && slotEnd > now) {
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          label: `${toTimeStamp(cursor)} – ${toTimeStamp(slotEnd)}`,
          type: window.appointment_type,
          duration
        });
      }
      cursor = slotEnd;
    }
  }
  return slots;
}

module.exports = { parseDate, generateSlots };
