'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');

function readJs(name) {
  return fs.readFileSync(path.join(root, 'js', name), 'utf8');
}

const pages = [
  { file: 'index.html', scripts: ['api.js', 'public.js'] },
  { file: 'how-it-works.html', scripts: ['api.js', 'public.js'] },
  { file: 'security.html', scripts: ['api.js', 'public.js'] },
  { file: 'privacy.html', scripts: ['api.js', 'public.js'] },
  { file: 'terms.html', scripts: ['api.js', 'public.js'] },
  { file: 'doctors/index.html', scripts: ['api.js', 'public.js', 'directory.js'] },
  { file: 'patient/login.html', scripts: ['api.js', 'public.js', 'auth.js'] },
  { file: 'patient/register.html', scripts: ['api.js', 'public.js', 'auth.js'] },
  { file: 'patient/dashboard.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/appointments.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/book-appointment.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/prescriptions.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/medications.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/medical-history.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/notifications.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/profile.html', scripts: ['api.js', 'patient.js'] },
  { file: 'patient/settings.html', scripts: ['api.js', 'patient.js'] },
  { file: 'doctor/login.html', scripts: ['api.js', 'public.js', 'auth.js'] },
  { file: 'doctor/register.html', scripts: ['api.js', 'public.js', 'auth.js'] },
  { file: 'doctor/dashboard.html', scripts: ['api.js', 'doctor.js'] },
  { file: 'doctor/appointments.html', scripts: ['api.js', 'doctor.js'] },
  { file: 'doctor/consultation.html', scripts: ['api.js', 'doctor.js'] },
  { file: 'doctor/prescriptions.html', scripts: ['api.js', 'doctor.js'] },
  { file: 'doctor/profile.html', scripts: ['api.js', 'doctor.js'] },
  { file: 'admin/login.html', scripts: ['api.js', 'public.js', 'auth.js'] },
  { file: 'admin/dashboard.html', scripts: ['api.js', 'admin.js'] }
];

for (const page of pages) {
  const full = path.join(root, page.file);
  let html = fs.readFileSync(full, 'utf8');
  html = html.replace(/\s*<link rel="stylesheet" href="[^"]*css\/app\.css">/g, '');
  html = html.replace(/\s*<script src="[^"]*js\/[^"]+"><\/script>/g, '');
  html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts[^>]*>/g, '');
  html = html.replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '');
  html = html.replace(/\s*<style data-medicare>[\s\S]*?<\/style>/g, '');
  html = html.replace(/\s*<script data-medicare>[\s\S]*?<\/script>/g, '');
  const inject = `
  <style data-medicare>
${css}
  </style>`;
  html = html.replace('</head>', `${inject}\n</head>`);
  if (page.scripts.length) {
    const bundle = page.scripts
      .map((name) => `(function () {\n${readJs(name)}\n})();`)
      .join('\n');
    html = html.replace('</body>', `\n<script data-medicare>\n${bundle}\n</script>\n</body>`);
  }
  fs.writeFileSync(full, html);
  console.log('inlined', page.file);
}
