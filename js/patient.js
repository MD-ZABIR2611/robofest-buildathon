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
    const [overview, rxData, medData, doctors] = await Promise.all([
      api('/api/patient/overview'),
      api('/api/prescriptions?active=1&limit=1'),
      api('/api/medications?upcoming=1&limit=1'),
      api('/api/doctors?limit=24')
    ]);
    const latest = overview?.latestPrescription || rxData?.items?.[0] || null;
    const next = overview?.nextMedication || medData?.items?.[0] || null;
    const appts = overview?.appointments || [];
    const medList = (latest?.medicines || []).map((m) => `${h(m.medicine_name)} (${h(m.dosage)})`).join(', ');
    const abdullah = (doctors?.items || []).find((d) => /abdullah/i.test(d.name));
    const bookNow = abdullah
      ? `<p class="actions"><a class="btn" href="${hrefTo('patient/book-appointment.html?doctor=' + abdullah.id)}">See ${h(abdullah.name)} now</a></p>`
      : `<p class="actions"><a class="btn" href="${hrefTo('patient/book-appointment.html')}">Book a visit</a></p>`;
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
        ${appts.map((row) => `<a class="item" href="${hrefTo('patient/appointments.html')}">
          <div><strong>${h(row.doctor_name)}</strong><div class="tiny">${formatWhen(row.appointment_start)} · ${h(row.type)}</div></div>
          ${badge(row.status)}
        </a>`).join('') || `<div class="empty">No upcoming visits. <a href="${hrefTo('patient/book-appointment.html')}">Book an appointment</a></div>`}
      </div>
      ${bookNow}`;
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
  const now = Date.now();
  const items = data.items || [];
  const upcoming = items.filter((row) => new Date(row.appointment_end || row.appointment_start).getTime() >= now && !['cancelled', 'no_show'].includes(row.status));
  const past = items.filter((row) => !upcoming.includes(row));
  function rowHtml(row) {
    const open = ['scheduled', 'confirmed'].includes(row.status) && new Date(row.appointment_start).getTime() > now;
    return `
    <article class="item">
      <div>
        <strong>${h(row.doctor_name)}</strong>
        <div class="tiny">${h(row.specialization || '')} · ${h(row.type || 'Video')} · ${formatWhen(row.appointment_start)}</div>
        <div class="tiny">${h(row.reason || 'Consultation')}</div>
      </div>
      <div class="row-actions">
        ${badge(row.status)}
        ${open ? `<button class="btn-outline" type="button" data-reschedule="${row.id}" data-doctor="${h(row.doctor_id)}">Reschedule</button>` : ''}
        ${open ? `<button class="btn-secondary" type="button" data-cancel="${row.id}">Cancel</button>` : ''}
      </div>
    </article>`;
  }
  qs('content').innerHTML = `
    <p class="actions"><a class="btn" href="${hrefTo('patient/book-appointment.html')}">Book a visit</a></p>
    <div class="card" id="rescheduleCard" hidden>
      <h3>Reschedule visit</h3>
      <p class="tiny" id="rescheduleHint">Choose a new clinic time. Hours are shown in Bangladesh time.</p>
      <div class="form-row">
        <div class="field"><label for="rescheduleDate">Date</label><input id="rescheduleDate" type="date"></div>
      </div>
      <div id="rescheduleSlots" class="slots"></div>
      <p id="rescheduleAlert" class="alert danger hidden" role="alert"></p>
    </div>
    <h3>Upcoming</h3>
    <div class="list">${upcoming.map(rowHtml).join('') || '<div class="empty">No upcoming appointments.</div>'}</div>
    <h3>Earlier visits</h3>
    <div class="list">${past.map(rowHtml).join('') || '<div class="empty">No earlier visits.</div>'}</div>`;
  let rescheduleId = '';
  const dateInput = qs('rescheduleDate');
  async function loadRescheduleSlots() {
    const doctorId = dateInput.dataset.doctor;
    const date = dateInput.value;
    qs('rescheduleSlots').innerHTML = '<p class="tiny">Loading times.</p>';
    if (!doctorId || !date) return;
    try {
      const slots = await api(`/api/doctors/${doctorId}/slots?date=${date}`);
      if (!slots.slots.length) {
        qs('rescheduleSlots').innerHTML = '<p class="muted">No open times on this date. Try a weekday or Saturday morning.</p>';
        return;
      }
      qs('rescheduleSlots').innerHTML = slots.slots.map((slot) => `<button type="button" class="slot" data-start="${slot.start}">${h(slot.label)}</button>`).join('');
    } catch (err) {
      qs('rescheduleSlots').innerHTML = `<p class="muted">${h(err.message)}</p>`;
    }
  }
  qs('content').onclick = async (event) => {
    const cancelId = event.target.dataset.cancel;
    const rsId = event.target.dataset.reschedule;
    const slotBtn = event.target.closest('.slot');
    if (cancelId) {
      try {
        await api(`/api/appointments/${cancelId}/cancel`, { method: 'POST', body: {} });
        toast('Appointment cancelled.');
        appointments();
      } catch (err) { toast(err.message); }
      return;
    }
    if (rsId) {
      rescheduleId = rsId;
      const card = qs('rescheduleCard');
      card.hidden = false;
      dateInput.dataset.doctor = event.target.dataset.doctor;
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      qs('rescheduleHint').textContent = 'Pick a new time, then the visit updates immediately.';
      loadRescheduleSlots();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (slotBtn && rescheduleId) {
      try {
        await api(`/api/appointments/${rescheduleId}/reschedule`, { method: 'POST', body: { start: slotBtn.dataset.start } });
        toast('Appointment rescheduled.');
        appointments();
      } catch (err) {
        const box = qs('rescheduleAlert');
        box.textContent = err.message;
        box.classList.remove('hidden');
        toast(err.message);
      }
    }
  };
  dateInput.addEventListener('change', loadRescheduleSlots);
}

async function book() {
  const doctorId = new URLSearchParams(location.search).get('doctor');
  const doctors = await api('/api/doctors?limit=24');
  const list = doctors.items || [];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  const preferred = list.find((d) => d.id === doctorId) || list.find((d) => /abdullah/i.test(d.name)) || list[0];
  const doctorSelect = list.map((d) => `<option value="${h(d.id)}" ${preferred && d.id === preferred.id ? 'selected' : ''}>${h(d.name)} — ${h(d.specialization)}</option>`).join('');
  const chips = [];
  const chipStart = new Date();
  chipStart.setHours(12, 0, 0, 0);
  for (let i = 1; i <= 10; i += 1) {
    const d = new Date(chipStart);
    d.setDate(chipStart.getDate() + i);
    const stamp = isoLocal(d);
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const closed = d.getDay() === 0;
    chips.push(`<button type="button" class="date-chip${closed ? ' muted' : ''}" data-date="${stamp}" ${closed ? 'disabled' : ''} aria-pressed="${stamp === dateValue ? 'true' : 'false'}">${h(label)}</button>`);
  }
  if (!list.length) {
    qs('content').innerHTML = `<div class="empty">No verified doctors are available to book. <a href="${hrefTo('doctors/index.html')}">Open the directory</a></div>`;
    return;
  }
  qs('content').innerHTML = `
    <form id="bookForm" class="card">
      <div id="chosenHead"></div>
      <div class="field"><label for="doctor">Doctor</label>
        <select id="doctor" name="doctor_id" required>${doctorSelect}</select></div>
      <p class="tiny" id="hoursHint">Clinic times use Bangladesh hours. Sunday is closed. Saturday is morning only.</p>
      <p><button class="btn" type="button" id="instantBtn">See this doctor now</button></p>
      <p class="tiny">Instant visit opens the chart immediately so the clinician can read your history and prescribe.</p>
      <div class="form-row">
        <div class="field"><label for="date">Date</label><input id="date" type="date" required min="${dateValue}" value="${dateValue}"></div>
        <div class="field"><label for="type">Visit type</label>
          <select id="type"><option>Video</option><option>In-person</option></select></div>
      </div>
      <div class="field"><label>Quick dates</label><div id="dateChips" class="date-chips">${chips.join('')}</div></div>
      <div class="field"><label>Available times</label><div id="slots" class="slots"><p class="tiny">Loading times.</p></div></div>
      <p class="tiny" id="slotHint">Each visit is 30 minutes. Pick a time, then confirm.</p>
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
  function currentDoctor() {
    return list.find((d) => d.id === qs('doctor').value) || list[0];
  }
  function renderHead() {
    const chosen = currentDoctor();
    qs('chosenHead').innerHTML = chosen
      ? `<p class="kicker">${h(chosen.specialization)}</p><h2 style="margin-top:0">${h(chosen.name)}</h2><p class="muted">${h(chosen.bio || 'Verified clinician')} · Fee ${h(chosen.consultation_fee)}</p>`
      : '<p class="muted">Choose a doctor from the directory.</p>';
  }
  async function loadHours() {
    const id = qs('doctor').value;
    if (!id) return;
    try {
      const data = await api(`/api/doctors/${id}`);
      const windows = data.availability || [];
      qs('hoursHint').textContent = windows.length
        ? `Hours: ${windows.map((w) => `${DAYS[w.day_of_week]} ${String(w.start_time).slice(0, 5)}–${String(w.end_time).slice(0, 5)}`).join(' · ')}`
        : 'Clinic hours are not posted yet. Try another clinician.';
    } catch (_) {
      qs('hoursHint').textContent = 'Clinic times use Bangladesh hours. Sunday is closed. Saturday is morning only.';
    }
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
    history.replaceState({}, '', `${location.pathname}?doctor=${encodeURIComponent(qs('doctor').value)}`);
    renderHead();
    loadHours();
    loadSlots();
  });
  qs('date').addEventListener('change', loadSlots);
  qs('dateChips').addEventListener('click', (event) => {
    const chip = event.target.closest('.date-chip');
    if (!chip || chip.disabled) return;
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
  qs('instantBtn')?.addEventListener('click', async () => {
    const id = qs('doctor').value;
    if (!id) return toast('Please choose a doctor.');
    qs('instantBtn').disabled = true;
    try {
      await api('/api/appointments/instant', {
        method: 'POST',
        body: { doctor_id: id, type: qs('type').value, reason: qs('reason').value }
      });
      toast('Visit started. Your clinician can open the chart and prescribe now.');
      location.href = hrefTo('patient/appointments.html');
    } catch (err) {
      qs('instantBtn').disabled = false;
      setAlert(err.message);
      toast(err.message);
    }
  });
  qs('bookForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedStart) {
      setAlert('Please choose an available time.');
      return toast('Please choose an available time.');
    }
    qs('bookSubmit').disabled = true;
    try {
      await api('/api/appointments', {
        method: 'POST',
        body: { doctor_id: qs('doctor').value, start: selectedStart, type: qs('type').value, reason: qs('reason').value }
      });
      toast('Appointment confirmed. Your clinician can open the chart and issue a prescription.');
      location.href = hrefTo('patient/appointments.html');
    } catch (err) {
      qs('bookSubmit').disabled = false;
      setAlert(err.message);
      toast(err.message);
    }
  });
  renderHead();
  loadHours();
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
