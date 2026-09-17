'use strict';

(function () {
const { api, toast, formatWhen, badge, requireRole, renderShell, page: hrefTo } = window.Medicare;
const view = document.body.dataset.page;
const params = new URLSearchParams(location.search);

function qs(id) { return document.getElementById(id); }

async function boot() {
  const data = await requireRole('doctor');
  renderShell('doctor', location.pathname, data.user);
  if (view === 'doctor-dashboard') return dashboard();
  if (view === 'doctor-appointments') return appointments();
  if (view === 'doctor-consultation') return consultation();
  if (view === 'doctor-prescriptions') return prescriptions();
  if (view === 'doctor-profile') return profile(data);
}

async function dashboard() {
  const data = await api('/api/doctor/overview');
  qs('content').innerHTML = `
    <div class="alert ${data.profile.verification_status === 'verified' ? '' : 'warn'}">
      Verification status: ${data.profile.verification_status}. Only verified clinicians appear in booking.
    </div>
    <div class="list">
      ${data.appointments.map((row) => `<a class="item" href="${hrefTo('doctor/consultation.html?id=' + row.id)}">
        <div><strong>${row.patient_name}</strong><div class="tiny">${formatWhen(row.appointment_start)} · ${row.reason || 'Consultation'}</div></div>
        ${badge(row.status)}
      </a>`).join('') || '<div class="empty">No appointments yet.</div>'}
    </div>`;
}

async function appointments() {
  const data = await api('/api/appointments');
  qs('content').innerHTML = data.items.map((row) => `
    <div class="item">
      <div><strong>${row.patient_name}</strong><div class="tiny">${formatWhen(row.appointment_start)}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        ${badge(row.status)}
        <a class="btn" href="${hrefTo('doctor/consultation.html?id=' + row.id)}">Open</a>
      </div>
    </div>`).join('') || '<div class="empty">No appointments.</div>';
}

async function consultation() {
  const id = params.get('id');
  if (!id) {
    qs('content').innerHTML = '<div class="empty">Select an appointment from your schedule.</div>';
    return;
  }
  let access;
  try {
    access = await api(`/api/appointments/${id}/access`);
  } catch (err) {
    qs('content').innerHTML = `<div class="alert danger">${err.message}</div>`;
    return;
  }
  const stateClass = access.state === 'during' ? '' : access.state === 'before' ? 'warn' : 'danger';
  let extra = '';
  if (access.allowed) {
    const summary = await api(`/api/appointments/${id}/patient-summary`);
    extra = `
      <section class="card">
        <h3>Authorized patient information</h3>
        <p><strong>${summary.patient.name}</strong></p>
        <p class="tiny">DoB: ${summary.patient.date_of_birth || '—'} · Phone: ${summary.patient.phone || '—'}</p>
        <p class="tiny">Emergency: ${summary.patient.emergency_contact_name || '—'} ${summary.patient.emergency_contact_phone || ''}</p>
        <h4>Relevant history</h4>
        ${summary.history.map((h) => `<p class="tiny">${formatWhen(h.created_at)} — ${h.summary}</p>`).join('') || '<p class="muted">No prior history.</p>'}
      </section>
      <form id="consultForm" class="card">
        <h3>Consultation record</h3>
        <div class="field"><label>Chief complaint</label><input name="chief_complaint"></div>
        <div class="field"><label>Symptoms</label><textarea name="symptoms"></textarea></div>
        <div class="field"><label>Diagnosis</label><input name="diagnosis"></div>
        <div class="field"><label>Notes</label><textarea name="doctor_notes"></textarea></div>
        <div class="field"><label>Treatment plan</label><textarea name="treatment_plan"></textarea></div>
        <div class="field"><label>Follow-up</label><textarea name="follow_up_instructions"></textarea></div>
        <button class="btn-secondary" type="submit">Save consultation</button>
      </form>
      <form id="rxForm" class="card">
        <h3>Digital prescription</h3>
        <p class="tiny">Issuing a prescription notifies the patient and generates the medication schedule automatically.</p>
        <div class="form-row">
          <div class="field"><label>Medicine</label><input name="medicine_name" required></div>
          <div class="field"><label>Dosage</label><input name="dosage" required placeholder="500 mg"></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Frequency</label><input name="frequency" required placeholder="3 times daily"></div>
          <div class="field"><label>Duration</label><input name="duration" required placeholder="5 days"></div>
        </div>
        <div class="field"><label>Instructions</label><input name="instructions" placeholder="After food"></div>
        <div class="field"><label>Prescription notes</label><textarea name="notes"></textarea></div>
        <button class="btn" type="submit">Issue prescription</button>
      </form>`;
  }
  qs('content').innerHTML = `
    <div class="alert ${stateClass}">${access.message}</div>
    <div class="card">
      <p class="kicker">${access.appointment.type} consultation</p>
      <h2>${access.appointment.patient_name}</h2>
      <p class="muted">${formatWhen(access.appointment.appointment_start)} – ${formatWhen(access.appointment.appointment_end)}</p>
      ${access.allowed ? `<button class="btn" id="startBtn">Start consultation</button>` : ''}
    </div>
    ${extra}`;
  qs('startBtn')?.addEventListener('click', async () => {
    try {
      await api(`/api/appointments/${id}/start`, { method: 'POST', body: {} });
      toast('Consultation started.');
    } catch (err) { toast(err.message); }
  });
  qs('consultForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/appointments/${id}/consultation`, { method: 'POST', body: Object.fromEntries(new FormData(event.target).entries()) });
      toast('Consultation saved.');
    } catch (err) { toast(err.message); }
  });
  qs('rxForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    try {
      const consult = await api(`/api/appointments/${id}/consultation`, { method: 'POST', body: { diagnosis: form.notes || 'See prescription' } });
      await api('/api/prescriptions', {
        method: 'POST',
        body: {
          consultation_id: consult.consultation.id,
          notes: form.notes,
          medicines: [{
            medicine_name: form.medicine_name,
            dosage: form.dosage,
            frequency: form.frequency,
            duration: form.duration,
            instructions: form.instructions
          }]
        }
      });
      toast('Prescription issued and delivered to the patient.');
      location.href = hrefTo('doctor/prescriptions.html');
    } catch (err) { toast(err.message); }
  });
}

async function prescriptions() {
  const data = await api('/api/prescriptions');
  qs('content').innerHTML = data.items.map((rx) => `
    <article class="card">
      <div class="page-head"><h3 style="margin:0">${rx.patient_name}</h3>${badge(rx.status)}</div>
      <ul>${(rx.medicines || []).map((m) => `<li>${m.medicine_name} — ${m.dosage}, ${m.frequency}</li>`).join('')}</ul>
    </article>`).join('') || '<div class="empty">No prescriptions issued yet.</div>';
}

async function profile(session) {
  const data = await api('/api/doctor/profile');
  const p = data.profile;
  qs('content').innerHTML = `
    <form id="docForm" class="card">
      <p>${badge(p.verification_status)}</p>
      <div class="form-row">
        <div class="field"><label>Name</label><input name="name" value="${session.user.name}"></div>
        <div class="field"><label>Specialization</label><input name="specialization" value="${p.specialization || ''}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Qualification</label><input name="qualification" value="${p.qualification || ''}"></div>
        <div class="field"><label>Experience (years)</label><input name="experience_years" type="number" value="${p.experience_years || 0}"></div>
      </div>
      <div class="field"><label>Bio</label><textarea name="bio">${p.bio || ''}</textarea></div>
      <p class="tiny">License number is verified separately and cannot be edited here.</p>
      <button class="btn">Save profile</button>
    </form>`;
  qs('docForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/doctor/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(event.target).entries()) });
      toast('Profile saved.');
    } catch (err) { toast(err.message); }
  });
}

boot().catch((err) => {
  if (err.message !== 'redirect') toast(err.message || 'Unable to load this page.');
});
})();
