'use strict';

(function () {
const { api, toast, badge, requireRole, formatWhen, h, page: hrefTo, loginFor } = window.Medicare;

function qs(id) { return document.getElementById(id); }

async function boot() {
  await requireRole('admin');
  const aside = document.getElementById('sidebar');
  aside.innerHTML = `
    <a class="brand" href="${hrefTo('admin/dashboard.html')}"><span class="logo"></span><span class="brand-mark">MediCare+</span></a>
    <p class="tiny who">Operations</p>
    <a class="active" href="${hrefTo('admin/dashboard.html')}">Review</a>
    <button class="btn-ghost signout" id="logoutBtn" type="button">Sign out</button>`;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) { /* ignore */ }
    window.location.href = loginFor('admin');
  });
  const [stats, doctors, audit] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/doctors?status=pending&limit=10'),
    api('/api/admin/audit?limit=8')
  ]);
  qs('content').innerHTML = `
    <div class="grid-3">
      <article class="card"><p class="kicker">Appointments</p><h3>${stats.appointments}</h3></article>
      <article class="card"><p class="kicker">Prescriptions</p><h3>${stats.prescriptions}</h3></article>
      <article class="card"><p class="kicker">Accounts</p>
        ${(stats.users || []).map((row) => `<p class="tiny">${h(row.role)}: ${row.n}</p>`).join('')}</article>
    </div>
    <h2>Pending clinicians</h2>
    <div class="list" id="pending">
      ${(doctors.items || []).map((d) => `
        <div class="item">
          <div><strong>${h(d.name)}</strong><div class="tiny">${h(d.specialization)} · ${h(d.license_number || '')}</div></div>
          <div class="row-actions">
            ${badge(d.verification_status)}
            <button class="btn" data-verify="${d.id}" data-status="verified">Verify</button>
            <button class="btn-danger" data-verify="${d.id}" data-status="rejected">Reject</button>
          </div>
        </div>`).join('') || '<div class="empty">No pending applications.</div>'}
    </div>
    <h2>Audit log</h2>
    <div class="table-wrap card">
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
        <tbody>
          ${(audit.items || []).map((row) => `<tr>
            <td>${formatWhen(row.created_at)}</td>
            <td>${h(row.name || '—')} <span class="tiny">${h(row.role || '')}</span></td>
            <td>${h(row.action)}</td>
            <td class="tiny">${h(row.resource_type || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  qs('pending')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-verify]');
    if (!btn) return;
    try {
      await api(`/api/admin/doctors/${btn.dataset.verify}/verification`, {
        method: 'PATCH',
        body: { verification_status: btn.dataset.status }
      });
      toast(btn.dataset.status === 'verified' ? 'Clinician verified.' : 'Application rejected.');
      boot();
    } catch (err) {
      toast(err.message);
    }
  });
}

boot().catch((err) => {
  if (err.message !== 'redirect') toast(err.message || 'Unable to load this page.');
});
})();
