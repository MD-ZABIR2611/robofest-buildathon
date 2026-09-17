'use strict';

(function () {
  const { api, homeFor } = window.Medicare || {};
  if (!api) return;
  const dash = document.getElementById('dashboardLink');
  api('/api/auth/me').then((data) => {
    if (!data.user) return;
    const href = homeFor(data.user.role);
    if (dash) {
      dash.href = href;
      dash.textContent = 'Open my dashboard';
      dash.classList.remove('hidden');
    }
    document.querySelectorAll('[data-guest]').forEach((el) => el.classList.add('hidden'));
  }).catch(() => {});

  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('primaryNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
})();
