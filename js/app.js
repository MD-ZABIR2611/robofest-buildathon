'use strict';

async function api(path, options = {}) {
  const init = {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    method: options.method || 'GET'
  };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error?.message || 'Unable to complete this request. Please try again.');
    error.status = res.status;
    error.payload = payload;
    throw error;
  }
  return payload.data;
}

function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function toast(message) {
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function icon(name) {
  const paths = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v4M16 4v4M4 11h16"/>',
    pill: '<path d="M8.5 15.5 15.5 8.5A4.95 4.95 0 1 0 8.5 15.5z"/><path d="M9.5 9.5l5 5"/>',
    file: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/>',
    bell: '<path d="M6 16h12l-1.2-2.2A6 6 0 0 1 16 9a4 4 0 0 0-8 0 6 6 0 0 1-1.8 4.8z"/><path d="M10 18a2 2 0 0 0 4 0"/>',
    user: '<circle cx="12" cy="8" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4"/>',
    stethoscope: '<path d="M6 4v6a4 4 0 0 0 8 0V4"/><circle cx="18" cy="16" r="3"/><path d="M10 14v1a5 5 0 0 0 5 5h0a3 3 0 0 0 3-3"/>',
    shield: '<path d="M12 3 5 6v6c0 5 3.4 7.7 7 9 3.6-1.3 7-4 7-9V6z"/>',
    logout: '<path d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2M4 12h10M7 9l-3 3 3 3"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.home}</svg>`;
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function badge(status) {
  const map = {
    confirmed: 'ok',
    scheduled: 'info',
    in_progress: 'warn',
    completed: 'ok',
    cancelled: 'danger',
    due: 'warn',
    taken: 'ok',
    missed: 'danger',
    skipped: 'danger',
    upcoming: 'info',
    active: 'ok',
    pending: 'warn',
    verified: 'ok'
  };
  return `<span class="badge ${map[status] || ''}">${String(status || '').replaceAll('_', ' ')}</span>`;
}

const PATIENT_NAV = [
  ['/patient/dashboard.html', 'home', 'Home'],
  ['/doctors/', 'search', 'Find doctors'],
  ['/patient/appointments.html', 'calendar', 'Appointments'],
  ['/patient/book-appointment.html', 'plus', 'Book'],
  ['/patient/prescriptions.html', 'file', 'Prescriptions'],
  ['/patient/medications.html', 'pill', 'Medications'],
  ['/patient/medical-history.html', 'file', 'History'],
  ['/patient/notifications.html', 'bell', 'Notifications'],
  ['/patient/profile.html', 'user', 'Profile'],
  ['/patient/settings.html', 'settings', 'Settings']
];

const DOCTOR_NAV = [
  ['/doctor/dashboard.html', 'home', 'Home'],
  ['/doctor/appointments.html', 'calendar', 'Appointments'],
  ['/doctor/consultation.html', 'stethoscope', 'Consultation'],
  ['/doctor/prescriptions.html', 'file', 'Prescriptions'],
  ['/doctor/profile.html', 'user', 'Profile']
];

async function requireRole(role) {
  try {
    const data = await api('/api/auth/me');
    if (!data.user) {
      window.location.href = role === 'doctor' ? '/doctor/login.html' : '/patient/login.html';
      throw new Error('redirect');
    }
    if (data.user.role !== role) {
      window.location.href = data.user.role === 'doctor' ? '/doctor/dashboard.html' : '/patient/dashboard.html';
      throw new Error('redirect');
    }
    return data;
  } catch (err) {
    if (err.message === 'redirect') throw err;
    window.location.href = role === 'doctor' ? '/doctor/login.html' : '/patient/login.html';
    throw new Error('redirect');
  }
}

function renderShell(role, active, user) {
  const nav = role === 'doctor' ? DOCTOR_NAV : PATIENT_NAV;
  const aside = document.getElementById('sidebar');
  const who = user ? `<p class="tiny who">${h(user.name)}</p>` : '';
  aside.innerHTML = `
    <a class="brand" href="${role === 'doctor' ? '/doctor/dashboard.html' : '/patient/dashboard.html'}">
      <span class="logo">${icon('shield')}</span><span class="brand-mark">MediCare+</span>
    </a>
    ${who}
    ${nav.map(([href, ic, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${icon(ic)}${label}</a>`).join('')}
    <button class="btn-ghost signout" id="logoutBtn" type="button">${icon('logout')} Sign out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) { /* ignore */ }
    window.location.href = role === 'doctor' ? '/doctor/login.html' : '/patient/login.html';
  });
  const menu = document.getElementById('menuBtn');
  if (menu) menu.addEventListener('click', () => aside.classList.toggle('open'));
}

window.Medicare = { api, toast, icon, formatWhen, badge, requireRole, renderShell, h };
