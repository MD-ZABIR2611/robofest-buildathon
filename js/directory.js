'use strict';

(function () {
const { api, toast, badge } = window.Medicare;

async function load() {
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || '';
  const page = params.get('page') || '1';
  const search = document.getElementById('searchForm');
  if (search) search.q.value = q;
  try {
    const data = await api(`/api/doctors?q=${encodeURIComponent(q)}&page=${page}`);
    const root = document.getElementById('directory');
    if (!data.items.length) {
      root.innerHTML = '<div class="empty">Unable to find matching doctors. Try another search.</div>';
      return;
    }
    root.innerHTML = data.items.map((d) => `
      <article class="card">
        <p class="kicker">${d.specialization}</p>
        <h3>${d.name}</h3>
        <p class="muted">${d.qualification || ''} · ${d.experience_years} years</p>
        <p>${d.bio || ''}</p>
        <p>${badge('verified')} · Consultation ${d.consultation_fee}</p>
        <p><a class="btn" href="${window.Medicare.page('patient/book-appointment.html?doctor=' + d.id)}">Book a visit</a></p>
      </article>`).join('');
  } catch (err) {
    toast(err.message || 'Unable to load doctors.');
    document.getElementById('directory').innerHTML = '<div class="empty">Unable to load doctors. Please try again.</div>';
  }
}

document.getElementById('searchForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = event.target.q.value.trim();
  location.search = q ? `?q=${encodeURIComponent(q)}` : '';
});

load();
})();
