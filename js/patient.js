'use strict';

(function () {
const { api, toast, formatWhen, badge, requireRole, renderShell, page: hrefTo, h } = window.Medicare;
const view = document.body.dataset.page;

function qs(id) { return document.getElementById(id); }

async function boot() {
  const data = await requireRole('patient');
  renderShell('patient', location.pathname, data.user);
  if (view === 'patient-dashboard') return dashboard();
  if (view === 'patient-appointments') return appointments();
  if (view === 'patient-book') return book();
  if (view === 'patient-prescriptions') return prescriptions();
  if (view === 'patient-medications') return medications();
  if (view === 'patient-history') return history();
  if (view === 'patient-notifications') return notifications();
  if (view === 'patient-profile') return profile(data);
  if (view === 'patient-settings') return settings(data);
}

async function dashboard() {
  const { api, toast, formatWhen, badge, h, doseAt, formatCountdown } = window.Medicare;
  async function render() {
    const [overview, rxData, medData] = await Promise.all([
      api('/api/patient/overview'),
      api('/api/prescriptions?active=1&limit=1'),
      api('/api/medications?upcoming=1&limit=1')
    ]);
    const latest = overview?.latestPrescription || rxData?.items?.[0] || null;
    const next = overview?.nextMedication || medData?.items?.[0] || null;
    const appts = overview?.appointments || [];
    const medList = (latest?.medicines || []).map((m) => `${h(m.medicine_name)} (${h(m.dosage)})`).join(', ');
    qs('content').innerHTML = `
      <div class="grid-3">
        <article class="card">
          <p class="kicker">Latest prescription</p>
          <h3>${latest ? h(latest.doctor_name) : 'None yet'}</h3>
          ${latest
            ? `<p>${medList || 'Medicines on file'}</p><p class="tiny">${formatWhen(latest.created_at)}</p>${badge(latest.status)}`
            : '<p class="muted">When your clinician issues a prescription, it appears here automatically.</p>'}
          <p><a href="${hrefTo('patient/prescriptions.html')}">View prescriptions</a></p>
        </article>
        <article class="card" id="nextMedCard">
          <p class="kicker">Next medication</p>
          ${next
            ? `<h3>${h(next.medicine_name)}</h3>
               <p class="tiny">${h(next.dosage)} · ${h(next.scheduled_date)} ${String(next.scheduled_time).slice(0, 5)}</p>
               <p class="countdown" id="medCountdown">${formatCountdown(doseAt(next) - Date.now())}</p>
               ${badge(next.status)}
               <p><button class="btn" type="button" data-taken="${next.id}">Mark as Taken</button></p>`
            : '<p class="muted">No upcoming doses. A schedule is created when a prescription is issued.</p>'}
        </article>
        <article class="card">
          <p class="kicker">Inbox</p>
          <h3>Notifications</h3>
          <p class="muted">${overview?.unread || 0} unread</p>
          <p><a href="${hrefTo('patient/notifications.html')}">View all</a></p>
        </article>
      </div>
      <div class="list card-stack">
        ${appts.map((row) => `<div class="item"><div><strong>${h(row.doctor_name)}</strong><div class="tiny">${formatWhen(row.appointment_start)} · ${h(row.type)}</div></div>${badge(row.status)}</div>`).join('') || '<div class="empty">No appointments to show.</div>'}
      </div>`;
    const countdown = document.getElementById('medCountdown');
    if (countdown && next) {
      if (window.__medTimer) clearInterval(window.__medTimer);
      window.__medTimer = setInterval(() => {
        countdown.textContent = formatCountdown(doseAt(next) - Date.now());
      }, 1000);
    }
    qs('content').querySelector('[data-taken]')?.addEventListener('click', async (event) => {
      try {
        await api(`/api/medications/${event.currentTarget.dataset.taken}/taken`, { method: 'POST', body: {} });
        toast('Dose marked as taken.');
        render();
      } catch (err) {
        toast(err.message);
      }
    });
  }
  await render();
  if (window.__dashPoll) clearInterval(window.__dashPoll);
  window.__dashPoll = setInterval(render, 20000);
}

async function appointments() {
  const data = await api('/api/appointments');
  qs('content').innerHTML = data.items.length ? data.items.map((row) => `
    <div class="item">
      <div>
        <strong>${row.doctor_name}</strong>
        <div class="tiny">${row.specialization} · ${formatWhen(row.appointment_start)}</div>
        <div class="tiny">${row.reason || 'Consultation'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${badge(row.status)}
        ${['scheduled','confirmed'].includes(row.status) ? `<button class="btn-secondary" data-cancel="${row.id}">Cancel</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty">You have no appointments yet.</div>';
  qs('content').addEventListener('click', async (event) => {
    const id = event.target.dataset.cancel;
    if (!id) return;
    try {
      await api(`/api/appointments/${id}/cancel`, { method: 'POST', body: {} });
      toast('Appointment cancelled.');
      appointments();
    } catch (err) { toast(err.message); }
  });
}

async function book() {
  const doctorId = new URLSearchParams(location.search).get('doctor');
  const doctors = await api('/api/doctors?limit=24');
  const { h } = window.Medicare;
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoLocal(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function nextOpenDate() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    for (let i = 0; i < 14; i += 1) {
      if (d.getDay() !== 0) return isoLocal(d);
      d.setDate(d.getDate() + 1);
    }
    return isoLocal(d);
  }
  const dateValue = nextOpenDate();
  const doctorSelect = (doctors.items || []).map((d) => `<option value="${h(d.id)}" ${d.id === doctorId ? 'selected' : ''}>${h(d.name)} — ${h(d.specialization)}</option>`).join('');
  const chips = [];
  const chipStart = new Date();
  chipStart.setHours(12, 0, 0, 0);
  for (let i = 1; i <= 10; i += 1) {
    const d = new Date(chipStart);
    d.setDate(chipStart.getDate() + i);
    const stamp = isoLocal(d);
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const closed = d.getDay() === 0;
    chips.push(`<button type="button" class="date-chip${closed ? ' muted' : ''}" data-date="${stamp}" aria-pressed="${stamp === dateValue ? 'true' : 'false'}">${h(label)}</button>`);
  }
  const chosen = (doctors.items || []).find((d) => d.id === doctorId) || (doctors.items || [])[0];
  qs('content').innerHTML = `
    <form id="bookForm" class="card">
      ${chosen ? `<p class="kicker">${h(chosen.specialization)}</p><h2 style="margin-top:0">${h(chosen.name)}</h2><p class="muted">${h(chosen.bio || 'Verified clinician')} · Fee ${h(chosen.consultation_fee)}</p>` : '<p class="muted">Choose a doctor from the directory.</p>'}
      <div class="field"><label for="doctor">Doctor</label>
        <select id="doctor" name="doctor_id" required>${doctorSelect || '<option value="">No doctors available</option>'}</select></div>
      <div class="form-row">
        <div class="field"><label for="date">Date</label><input id="date" type="date" required value="${dateValue}"></div>
        <div class="field"><label for="type">Visit type</label>
          <select id="type"><option>Video</option><option>In-person</option></select></div>
      </div>
      <div class="field"><label>Quick dates</label><div id="dateChips" class="date-chips">${chips.join('')}</div></div>
      <div class="field"><label>Available times</label><div id="slots" class="slots"><p class="tiny">Loading times.</p></div></div>
      <p class="tiny" id="slotHint">Times are 30-minute visits. Sunday is closed. Saturday is morning only.</p>
      <div class="field"><label for="reason">Reason</label><textarea id="reason" placeholder="What would you like to discuss?"></textarea></div>
      <p id="bookAlert" class="alert danger hidden" role="alert"></p>
      <button class="btn" type="submit" id="bookSubmit" disabled>Confirm appointment</button>
    </form>`;
  let selectedStart = '';
  function setAlert(message) {
    const box = qs('bookAlert');
    if (!box) return;
    if (!message) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.classList.remove('hidden');
  }
  function markChip() {
    const date = qs('date').value;
    qs('dateChips').querySelectorAll('.date-chip').forEach((el) => {
      el.setAttribute('aria-pressed', el.dataset.date === date ? 'true' : 'false');
    });
  }
  async function loadSlots() {
    const id = qs('doctor').value;
    const date = qs('date').value;
    selectedStart = '';
    qs('bookSubmit').disabled = true;
    markChip();
    if (!id || !date) return;
    qs('slots').innerHTML = '<p class="tiny">Loading times.</p>';
    try {
      const data = await api(`/api/doctors/${id}/slots?date=${date}`);
      if (data.slots.length) {
        qs('slots').innerHTML = data.slots.map((slot) => `<button type="button" class="slot" data-start="${slot.start}">${h(slot.label)}</button>`).join('');
        setAlert('');
      } else {
        qs('slots').innerHTML = '<p class="muted">No open times on this date. Try a weekday, or Saturday morning.</p>';
      }
    } catch (err) {
      qs('slots').innerHTML = `<p class="muted">${h(err.message || 'Unable to load times.')}</p>`;
    }
  }
  qs('doctor').addEventListener('change', () => {
    location.href = `${hrefTo('patient/book-appointment.html')}?doctor=${encodeURIComponent(qs('doctor').value)}`;
  });
  qs('date').addEventListener('change', loadSlots);
  qs('dateChips').addEventListener('click', (event) => {
    const chip = event.target.closest('.date-chip');
    if (!chip) return;
    qs('date').value = chip.dataset.date;
    loadSlots();
  });
  qs('slots').addEventListener('click', (event) => {
    const btn = event.target.closest('.slot');
    if (!btn) return;
    selectedStart = btn.dataset.start;
    qs('bookSubmit').disabled = false;
    setAlert('');
    qs('slots').querySelectorAll('.slot').forEach((el) => el.setAttribute('aria-pressed', el === btn ? 'true' : 'false'));
  });
  qs('bookForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedStart) {
      setAlert('Please choose an available time.');
      return toast('Please choose an available time.');
    }
    try {
      await api('/api/appointments', {
        method: 'POST',
        body: { doctor_id: qs('doctor').value, start: selectedStart, type: qs('type').value, reason: qs('reason').value }
      });
      toast('Appointment confirmed.');
      location.href = hrefTo('patient/appointments.html');
    } catch (err) {
      setAlert(err.message);
      toast(err.message);
    }
  });
  loadSlots();
}

async function prescriptions() {
  const data = await api('/api/prescriptions');
  qs('content').innerHTML = data.items.length ? data.items.map((rx) => `
    <article class="card">
      <div class="page-head"><h3 style="margin:0">Dr. ${rx.doctor_name}</h3>${badge(rx.status)}</div>
      <p class="tiny">${formatWhen(rx.created_at)}</p>
      <ul>${(rx.medicines || []).map((m) => `<li><strong>${m.medicine_name}</strong> — ${m.dosage}, ${m.frequency}, ${m.duration}</li>`).join('')}</ul>
      ${rx.notes ? `<p class="muted">${rx.notes}</p>` : ''}
    </article>`).join('') : '<div class="empty">No prescriptions yet.</div>';
}

async function medications() {
  const data = await api('/api/medications');
  qs('content').innerHTML = data.items.length ? data.items.map((row) => `
    <div class="item">
      <div>
        <strong>${row.medicine_name}</strong>
        <div class="tiny">${row.dosage} · ${row.scheduled_date} ${String(row.scheduled_time).slice(0,5)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${badge(row.status)}
        ${['scheduled','upcoming','due','missed'].includes(row.status) ? `<button class="btn" data-taken="${row.id}">Mark taken</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty">No medication schedule yet.</div>';
  qs('content').addEventListener('click', async (event) => {
    const id = event.target.dataset.taken;
    if (!id) return;
    try {
      await api(`/api/medications/${id}/taken`, { method: 'POST', body: {} });
      toast('Dose marked as taken.');
      medications();
    } catch (err) { toast(err.message); }
  });
}

async function history() {
  const data = await api('/api/patient/history');
  qs('content').innerHTML = data.items.length
    ? `<div class="timeline">${data.items.map((row) => `<div><div class="tiny">${formatWhen(row.created_at)}</div><strong>${row.record_type}</strong><p>${row.summary}</p></div>`).join('')}</div>`
    : '<div class="empty">Your medical history will appear here after consultations.</div>';
}

async function notifications() {
  const data = await api('/api/notifications');
  qs('content').innerHTML = `
    <p><button class="btn-secondary" id="readAll">Mark all read</button></p>
    ${data.items.length ? data.items.map((n) => `<div class="item"><div><strong>${n.title}</strong><div class="tiny">${n.message}</div><div class="tiny">${formatWhen(n.created_at)}</div></div>${n.read ? badge('completed') : badge('upcoming')}</div>`).join('') : '<div class="empty">No notifications.</div>'}`;
  qs('readAll')?.addEventListener('click', async () => {
    await api('/api/notifications/read-all', { method: 'POST', body: {} });
    notifications();
  });
}

async function profile(session) {
  const data = await api('/api/patient/profile');
  const p = data.profile;
  qs('content').innerHTML = `
    <form id="profileForm" class="card">
      <div class="form-row">
        <div class="field"><label>Name</label><input name="name" value="${h(session.user.name)}"></div>
        <div class="field"><label>Email</label><input value="${h(session.user.email)}" disabled></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Date of birth</label><input name="date_of_birth" type="date" value="${h(String(p.date_of_birth || '').slice(0, 10))}"></div>
        <div class="field"><label>Phone</label><input name="phone" value="${h(p.phone || '')}"></div>
      </div>
      <div class="field"><label>Address</label><input name="address" value="${h(p.address || '')}"></div>
      <div class="form-row">
        <div class="field"><label>Emergency contact</label><input name="emergency_contact_name" value="${h(p.emergency_contact_name || '')}"></div>
        <div class="field"><label>Emergency phone</label><input name="emergency_contact_phone" value="${h(p.emergency_contact_phone || '')}"></div>
      </div>
      <button class="btn">Save profile</button>
    </form>`;
  qs('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/patient/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(event.target).entries()) });
      toast('Profile saved.');
    } catch (err) { toast(err.message); }
  });
}

async function settings(session) {
  qs('content').innerHTML = `
    <div class="card">
      <h3>Account</h3>
      <p>Signed in as ${session.user.email}. Your role is managed by MediCare+ and cannot be changed here.</p>
      <p class="tiny">Role: ${session.user.role}</p>
      <h3>Password</h3>
      <form id="forgotSelf">
        <p class="muted">We will email password reset instructions.</p>
        <button class="btn-secondary">Send reset email</button>
      </form>
    </div>`;
  qs('forgotSelf').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/auth/forgot-password', { method: 'POST', body: { email: session.user.email } });
    toast('If an account exists, reset instructions have been sent.');
  });
}

boot().catch((err) => {
  if (err.message === 'redirect') return;
  const box = qs('content');
  if (box) box.innerHTML = `<div class="empty">${err.message || 'Unable to load this page.'}</div>`;
  toast(err.message || 'Unable to load this page.');
});
})();
