'use strict';

function parseDurationDays(duration) {
  const match = String(duration).match(/(\d+)/);
  const n = match ? Number.parseInt(match[1], 10) : 7;
  return Math.min(90, Math.max(1, n));
}

function timesForFrequency(frequency) {
  const f = String(frequency).toLowerCase();
  if (/\bqid\b/.test(f) || f.includes('four') || /\b4\b/.test(f) || f.includes('4 time')) {
    return ['08:00:00', '12:00:00', '16:00:00', '20:00:00'];
  }
  if (/\btid\b/.test(f) || f.includes('thrice') || f.includes('three') || /\b3\b/.test(f) || f.includes('3 time')) {
    return ['08:00:00', '14:00:00', '20:00:00'];
  }
  if (/\bbid\b/.test(f) || f.includes('twice') || /\b2\b/.test(f) || f.includes('2 time')) {
    return ['08:00:00', '20:00:00'];
  }
  if (f.includes('8 hour') || f.includes('every 8')) return ['08:00:00', '16:00:00', '00:00:00'];
  return ['08:00:00'];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

const CLINIC_TZ = process.env.CLINIC_TZ || 'Asia/Dhaka';

function clinicParts(date, timeZone = CLINIC_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute')
  };
}

function toDateStamp(d, timeZone = CLINIC_TZ) {
  const p = clinicParts(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function toTimeStamp(d, timeZone = CLINIC_TZ) {
  const p = clinicParts(d, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function fromClinicLocal(stamp, hours, minutes, timeZone = CLINIC_TZ) {
  const [year, month, day] = String(stamp).split('-').map(Number);
  let utc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const got = clinicParts(new Date(utc), timeZone);
    const wanted = Date.UTC(year, month - 1, day, hours, minutes);
    const actual = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);
    utc += wanted - actual;
  }
  return new Date(utc);
}

function clinicDayOfWeek(stamp, timeZone = CLINIC_TZ) {
  const noon = fromClinicLocal(stamp, 12, 0, timeZone);
  const p = clinicParts(noon, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

module.exports = {
  parseDurationDays,
  timesForFrequency,
  addMinutes,
  toDateStamp,
  toTimeStamp,
  CLINIC_TZ,
  clinicParts,
  fromClinicLocal,
  clinicDayOfWeek
};
