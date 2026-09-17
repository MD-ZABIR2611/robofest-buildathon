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

function toDateStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeStamp(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  parseDurationDays,
  timesForFrequency,
  addMinutes,
  toDateStamp,
  toTimeStamp
};
