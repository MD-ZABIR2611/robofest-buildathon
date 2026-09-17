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
      Verification status: ${data.profile.verification_status}. Verified clinicians appear in the patient booking list.
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
  const { h } = window.Medicare;
  const items = data.items || [];
  qs('content').innerHTML = items.length ? items.map((row) => `
    <div class="item">
      <div>
        <strong>${h(row.patient_name)}</strong>
        <div class="tiny">${formatWhen(row.appointment_start)} · ${h(row.type || 'Visit')}</div>
        <div class="tiny">${h(row.reason || 'Consultation')}</div>
      </div>
      <div class="row-actions">
        ${badge(row.status)}
        <a class="btn" href="${hrefTo('doctor/consultation.html?id=' + row.id)}">Open chart</a>
      </div>
    </div>`).join('') : '<div class="empty">No appointments yet. Patients book from their dashboard.</div>';
}

async function consultation() {
  const id = params.get('id');
  const { h } = window.Medicare;
  if (!id) {
    qs('content').innerHTML = '<div class="empty">Select an appointment from your schedule.</div>';
    return;
  }
  let access;
  try {
    access = await api(`/api/appointments/${id}/access`);
  } catch (err) {
    qs('content').innerHTML = `<div class="alert danger">${h(err.message)}</div>`;
    return;
  }
  const stateClass = access.state === 'during' ? '' : access.state === 'before' ? 'warn' : 'danger';
  let extra = '';
  let saved = null;
  if (access.allowed) {
    const summary = await api(`/api/appointments/${id}/patient-summary`);
    try {
      const existing = await api(`/api/appointments/${id}/consultation`);
      saved = existing.consultation;
    } catch (_) {
      saved = null;
    }
    extra = `
      <section class="card">
        <h3>Patient chart</h3>
        <p><strong>${h(summary.patient.name)}</strong></p>
        <p class="tiny">DoB: ${h(String(summary.patient.date_of_birth || '—').slice(0, 10))} · Phone: ${h(summary.patient.phone || '—')}</p>
        <p class="tiny">Emergency: ${h(summary.patient.emergency_contact_name || '—')} ${h(summary.patient.emergency_contact_phone || '')}</p>
        <h4>History</h4>
        ${(summary.history || []).map((row) => `<p class="tiny">${formatWhen(row.created_at)} — ${h(row.summary)}</p>`).join('') || '<p class="muted">No prior history.</p>'}
      </section>
      <form id="consultForm" class="card">
        <h3>Consultation record</h3>
        <p id="consultAlert" class="alert danger hidden" role="alert"></p>
        <div class="field"><label>Chief complaint</label><input name="chief_complaint" value="${h(saved?.chief_complaint || '')}"></div>
        <div class="field"><label>Symptoms</label><textarea name="symptoms">${h(saved?.symptoms || '')}</textarea></div>
        <div class="field"><label>Diagnosis</label><input name="diagnosis" value="${h(saved?.diagnosis || '')}"></div>
        <div class="field"><label>Notes</label><textarea name="doctor_notes">${h(saved?.doctor_notes || '')}</textarea></div>
        <div class="field"><label>Treatment plan</label><textarea name="treatment_plan">${h(saved?.treatment_plan || '')}</textarea></div>
        <div class="field"><label>Follow-up</label><textarea name="follow_up_instructions">${h(saved?.follow_up_instructions || '')}</textarea></div>
        <button class="btn-secondary" type="submit">Save consultation</button>
      </form>
      <form id="rxForm" class="card">
        <h3>Digital prescription</h3>
        <p class="tiny">This notifies the patient and fills their medication timer.</p>
        <p id="rxAlert" class="alert danger hidden" role="alert"></p>
        <div id="medRows"></div>
        <p><button class="btn-outline" type="button" id="addMed">Add another medicine</button></p>
        <div class="field"><label>Prescription notes</label><textarea name="notes" placeholder="Take as written. Return if symptoms worsen."></textarea></div>
        <button class="btn" type="submit">Issue prescription</button>
      </form>`;
  }
  qs('content').innerHTML = `
    <div class="alert ${stateClass}">${h(access.message)}</div>
    <div class="card">
      <p class="kicker">${h(access.appointment.type)} consultation</p>
      <h2>${h(access.appointment.patient_name)}</h2>
      <p class="muted">${formatWhen(access.appointment.appointment_start)} – ${formatWhen(access.appointment.appointment_end)}</p>
      ${access.allowed ? `<button class="btn" id="startBtn" type="button">Start consultation</button>` : ''}
    </div>
    ${extra}`;

  function medRow(values = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'med-row card';
    wrap.style.padding = '12px';
    wrap.innerHTML = `
      <div class="form-row">
        <div class="field"><label>Medicine</label><input name="medicine_name" required value="${h(values.medicine_name || '')}"></div>
        <div class="field"><label>Dosage</label><input name="dosage" required placeholder="500 mg" value="${h(values.dosage || '')}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Frequency</label><input name="frequency" required placeholder="twice daily" value="${h(values.frequency || '')}"></div>
        <div class="field"><label>Duration</label><input name="duration" required placeholder="5 days" value="${h(values.duration || '')}"></div>
      </div>
      <div class="field"><label>Instructions</label><input name="instructions" placeholder="After food" value="${h(values.instructions || '')}"></div>`;
    return wrap;
  }
  const medBox = qs('medRows');
  if (medBox) {
    medBox.appendChild(medRow());
    qs('addMed')?.addEventListener('click', () => medBox.appendChild(medRow()));
  }

  qs('startBtn')?.addEventListener('click', async () => {
    try {
      await api(`/api/appointments/${id}/start`, { method: 'POST', body: {} });
      toast('Consultation started.');
      consultation();
    } catch (err) { toast(err.message); }
  });
  qs('consultForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const alertBox = qs('consultAlert');
    try {
      await api(`/api/appointments/${id}/consultation`, { method: 'POST', body: Object.fromEntries(new FormData(event.target).entries()) });
      if (alertBox) { alertBox.classList.add('hidden'); alertBox.textContent = ''; }
      toast('Consultation saved.');
    } catch (err) {
      if (alertBox) { alertBox.textContent = err.message; alertBox.classList.remove('hidden'); }
      toast(err.message);
    }
  });
  qs('rxForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const alertBox = qs('rxAlert');
    const medicines = [...qs('medRows').querySelectorAll('.med-row')].map((row) => ({
      medicine_name: row.querySelector('[name="medicine_name"]').value,
      dosage: row.querySelector('[name="dosage"]').value,
      frequency: row.querySelector('[name="frequency"]').value,
      duration: row.querySelector('[name="duration"]').value,
      instructions: row.querySelector('[name="instructions"]').value
    })).filter((m) => m.medicine_name && m.dosage && m.frequency && m.duration);
    if (!medicines.length) {
      const msg = 'Add at least one complete medicine row.';
      if (alertBox) { alertBox.textContent = msg; alertBox.classList.remove('hidden'); }
      return toast(msg);
    }
    try {
      await api(`/api/appointments/${id}/prescriptions`, {
        method: 'POST',
        body: { notes: event.target.notes.value, medicines }
      });
      toast('Prescription issued and sent to the patient medication timer.');
      location.href = hrefTo('doctor/prescriptions.html');
    } catch (err) {
      if (alertBox) { alertBox.textContent = err.message; alertBox.classList.remove('hidden'); }
      toast(err.message);
    }
  });
}

async function prescriptions() {
  const data = await api('/api/prescriptions');
  const { h } = window.Medicare;
  qs('content').innerHTML = (data.items || []).length ? data.items.map((rx) => `
    <article class="card">
      <div class="page-head"><h3 style="margin:0">${h(rx.patient_name || 'Patient')}</h3>${badge(rx.status)}</div>
      <p class="tiny">${formatWhen(rx.created_at)}</p>
      <ul>${(rx.medicines || []).map((m) => `<li><strong>${h(m.medicine_name)}</strong> — ${h(m.dosage)}, ${h(m.frequency)}, ${h(m.duration)}</li>`).join('')}</ul>
      ${rx.notes ? `<p class="muted">${h(rx.notes)}</p>` : ''}
    </article>`).join('') : '<div class="empty">No prescriptions issued yet. Open a visit and use Issue prescription.</div>';
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
  if (err.message === 'redirect') return;
  const box = qs('content');
  if (box) box.innerHTML = `<div class="empty">${err.message || 'Unable to load this page.'}</div>`;
  toast(err.message || 'Unable to load this page.');
});
})();
