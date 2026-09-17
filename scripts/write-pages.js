'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function rel(fromFile, toFile) {
  let value = path.relative(path.dirname(path.join(root, fromFile)), path.join(root, toFile)).replace(/\\/g, '/');
  if (!value.startsWith('.')) value = './' + value;
  return value;
}

function publicNav(from, extra = '') {
  return `<header class="topnav">
    <a class="brand" href="${rel(from, 'index.html')}"><span class="logo"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 5 3.4 7.7 7 9 3.6-1.3 7-4 7-9V6z"/></svg></span><span class="brand-mark">MediCare+</span></a>
    <button class="site-nav-toggle" type="button" id="navToggle" aria-expanded="false" aria-controls="primaryNav">Menu</button>
    <nav class="nav-links" id="primaryNav" aria-label="Primary">
      <a href="${rel(from, 'doctors/index.html')}">Find a doctor</a>
      <a href="${rel(from, 'how-it-works.html')}">How it works</a>
      <a href="${rel(from, 'security.html')}">Security</a>
      ${extra}
      <a class="btn-outline" href="${rel(from, 'patient/login.html')}">Patient login</a>
      <a class="btn" href="${rel(from, 'doctor/login.html')}">Doctor login</a>
    </nav>
  </header>`;
}

function write(file, html) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), html);
  console.log('wrote', file);
}

write('index.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediCare+ — Healthcare, organized around you</title>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  ${publicNav('index.html', `<a class="btn hidden" id="dashboardLink" href="${rel('index.html', 'patient/dashboard.html')}">Open my dashboard</a>`)}
  <main id="content" class="hero">
    <div>
      <p class="kicker">Premium healthcare, calmly organized</p>
      <h1>From booking to daily doses, in one place.</h1>
      <p class="lede">Patients and doctors each have their own workspace. Sign in and you are taken to the right dashboard automatically.</p>
      <p class="actions">
        <a class="btn" href="${rel('index.html', 'patient/register.html')}">Create a patient account</a>
        <a class="btn-outline" href="${rel('index.html', 'patient/login.html')}">Patient login</a>
        <a class="btn-outline" href="${rel('index.html', 'doctor/login.html')}">Doctor login</a>
      </p>
    </div>
    <aside class="hero-card">
      <p class="kicker">Connected pages</p>
      <h2>Move through the product with simple links.</h2>
      <p><a href="${rel('index.html', 'doctors/index.html')}">Browse doctors</a></p>
      <p><a href="${rel('index.html', 'patient/book-appointment.html')}">Book an appointment</a> (after patient login)</p>
      <p><a href="${rel('index.html', 'how-it-works.html')}">How it works</a> · <a href="${rel('index.html', 'security.html')}">Security</a></p>
    </aside>
  </main>
  <section class="section grid-3">
    <article class="card"><h3>Patients</h3><p class="muted">Appointments, prescriptions, medications, history, and reminders.</p><p><a href="${rel('index.html', 'patient/login.html')}">Go to patient login</a></p></article>
    <article class="card"><h3>Doctors</h3><p class="muted">Consultations, time-limited access, and digital prescriptions.</p><p><a href="${rel('index.html', 'doctor/login.html')}">Go to doctor login</a></p></article>
    <article class="card"><h3>Directory</h3><p class="muted">Only verified clinicians are bookable.</p><p><a href="${rel('index.html', 'doctors/index.html')}">Open doctor directory</a></p></article>
  </section>
  <footer class="footer">
    <span>MediCare+</span>
    <span><a href="${rel('index.html', 'privacy.html')}">Privacy</a> · <a href="${rel('index.html', 'terms.html')}">Terms</a> · <a href="${rel('index.html', 'security.html')}">Security</a></span>
  </footer>
</body>
</html>`);

function infoPage(file, title, body) {
  write(file, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · MediCare+</title>
</head>
<body>
  ${publicNav(file)}
  <main class="section">${body}</main>
  <footer class="footer"><a href="${rel(file, 'index.html')}">Home</a></footer>
</body>
</html>`);
}

infoPage('how-it-works.html', 'How it works', `
  <p class="kicker">Workflow</p>
  <h1>From first visit to daily doses</h1>
  <p class="lede">The same links you see in the header are the real files in this project.</p>
  <p class="actions">
    <a class="btn" href="${rel('how-it-works.html', 'patient/register.html')}">Start as a patient</a>
    <a class="btn-outline" href="${rel('how-it-works.html', 'doctor/register.html')}">Apply as a doctor</a>
  </p>
  <ol class="grid-2" style="padding:0;list-style:decimal inside">
    <li class="card">Register and verify email</li>
    <li class="card">Find a verified doctor</li>
    <li class="card">Book a generated slot</li>
    <li class="card">Consult in the time window</li>
    <li class="card">Receive a digital prescription</li>
    <li class="card">Follow the auto-built medication schedule</li>
  </ol>`);

infoPage('security.html', 'Security', `<p class="kicker">Protection</p><h1>Access is decided on the server.</h1><article class="card"><p>Doctors see patient information only during a valid appointment window. Frontend clocks and URL tricks are not trusted.</p></article>`);
infoPage('privacy.html', 'Privacy', `<h1>Privacy</h1><article class="card"><p>Patients see only their own records. Email notices avoid extra clinical detail.</p></article>`);
infoPage('terms.html', 'Terms', `<h1>Terms of use</h1><article class="card"><p>MediCare+ coordinates care. It is not an emergency service.</p></article>`);

write('doctors/index.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Find a doctor · MediCare+</title>
</head>
<body>
  ${publicNav('doctors/index.html')}
  <main class="section">
    <div class="page-head">
      <div><p class="kicker">Directory</p><h1>Verified doctors</h1></div>
      <form id="searchForm" class="field" style="min-width:240px">
        <label class="sr-only" for="q">Search</label>
        <input id="q" name="q" placeholder="Name or specialty">
      </form>
    </div>
    <p class="tiny">Booking opens the patient book page: <a href="${rel('doctors/index.html', 'patient/book-appointment.html')}">book-appointment.html</a></p>
    <div id="directory" class="grid-3"></div>
  </main>
</body>
</html>`);

function authPage(file, page, kicker, title, form, extra = '') {
  write(file, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · MediCare+</title>
</head>
<body data-page="${page}">
  ${publicNav(file)}
  <main class="auth-wrap">${form}${extra}</main>
</body>
</html>`);
}

authPage('patient/login.html', 'patient-login', 'Patient', 'Patient sign in', `
  <form id="loginForm" class="card" method="post" action="#">
    <p class="kicker">Patient</p>
    <h1>Sign in</h1>
    <p class="tiny">Gmail is not an account until you register. Use the email and password from <a href="${rel('patient/login.html', 'patient/register.html')}">Create a patient account</a>, or the demo patient login.</p>
    <div id="authAlert" class="alert danger hidden" role="alert"></div>
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required></div>
    <button class="btn" type="submit">Continue to patient dashboard</button>
    <p class="tiny"><a href="${rel('patient/login.html', 'patient/register.html')}">Create a patient account</a> · <a href="${rel('patient/login.html', 'doctor/login.html')}">Doctor login</a></p>
  </form>
  <form id="forgotForm" class="card" style="margin-top:16px">
    <h2>Reset password</h2>
    <div class="field"><label>Email</label><input name="email" type="email" required></div>
    <button class="btn-outline" type="submit">Send reset link</button>
  </form>
  <form id="resetBox" class="card hidden" style="margin-top:16px">
    <h2>Choose a new password</h2>
    <div class="field"><label>New password</label><input name="password" type="password" minlength="8" required></div>
    <button class="btn" type="submit">Update password</button>
  </form>`);

authPage('patient/register.html', 'patient-register', 'Patient', 'Patient registration', `
  <form id="registerForm" class="card">
    <p class="kicker">Patient</p>
    <h1>Create your account</h1>
    <div id="devVerify"></div>
    <div id="authAlert" class="alert danger hidden" role="alert"></div>
    <div class="field"><label>Full name</label><input name="name" required></div>
    <div class="field"><label>Email</label><input name="email" type="email" required></div>
    <div class="field"><label>Password</label><input name="password" type="password" minlength="8" required></div>
    <button class="btn" type="submit">Register</button>
    <p class="tiny">Then <a href="${rel('patient/register.html', 'patient/login.html')}">sign in</a> to open <a href="${rel('patient/register.html', 'patient/dashboard.html')}">your dashboard</a>.</p>
  </form>`);

authPage('doctor/login.html', 'doctor-login', 'Clinician', 'Clinician sign in', `
  <form id="loginForm" class="card" method="post" action="#">
    <p class="kicker">Clinician</p>
    <h1>Sign in</h1>
    <p class="tiny">This file links to the doctor dashboard after a successful login.</p>
    <div id="authAlert" class="alert danger hidden" role="alert"></div>
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required></div>
    <button class="btn" type="submit">Continue to doctor dashboard</button>
    <p class="tiny"><a href="${rel('doctor/login.html', 'doctor/register.html')}">Apply as a clinician</a> · <a href="${rel('doctor/login.html', 'patient/login.html')}">Patient login</a></p>
  </form>
  <form id="forgotForm" class="card" style="margin-top:16px">
    <h2>Reset password</h2>
    <div class="field"><label>Email</label><input name="email" type="email" required></div>
    <button class="btn-outline" type="submit">Send reset link</button>
  </form>
  <form id="resetBox" class="card hidden" style="margin-top:16px">
    <h2>Choose a new password</h2>
    <div class="field"><label>New password</label><input name="password" type="password" minlength="8" required></div>
    <button class="btn" type="submit">Update password</button>
  </form>`);

authPage('doctor/register.html', 'doctor-register', 'Clinician', 'Clinician application', `
  <form id="registerForm" class="card">
    <p class="kicker">Clinician</p>
    <h1>Apply to practice</h1>
    <div id="devVerify"></div>
    <div id="authAlert" class="alert danger hidden" role="alert"></div>
    <div class="field"><label>Full name</label><input name="name" required></div>
    <div class="field"><label>Email</label><input name="email" type="email" required></div>
    <div class="field"><label>Password</label><input name="password" type="password" minlength="8" required></div>
    <div class="field"><label>Specialization</label><input name="specialization" required></div>
    <div class="field"><label>License number</label><input name="license_number" required></div>
    <div class="field"><label>Qualification</label><input name="qualification"></div>
    <div class="field"><label>Years of experience</label><input name="experience_years" type="number" min="0"></div>
    <div class="field"><label>Bio</label><textarea name="bio"></textarea></div>
    <button class="btn" type="submit">Submit application</button>
    <p class="tiny">Then <a href="${rel('doctor/register.html', 'doctor/login.html')}">sign in</a>.</p>
  </form>`);

authPage('admin/login.html', 'admin-login', 'Operations', 'Admin sign in', `
  <form id="loginForm" class="card" method="post" action="#">
    <p class="kicker">Operations</p>
    <h1>Admin sign in</h1>
    <div id="authAlert" class="alert danger hidden" role="alert"></div>
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required></div>
    <button class="btn" type="submit">Continue</button>
  </form>`);

const shells = [
  ['patient/dashboard.html', 'patient-dashboard', 'Home', ''],
  ['patient/appointments.html', 'patient-appointments', 'Appointments', `<a class="btn" href="${rel('patient/appointments.html', 'patient/book-appointment.html')}">Book</a>`],
  ['patient/book-appointment.html', 'patient-book', 'Book an appointment', ''],
  ['patient/prescriptions.html', 'patient-prescriptions', 'Prescriptions', ''],
  ['patient/medications.html', 'patient-medications', 'Medication schedule', ''],
  ['patient/medical-history.html', 'patient-history', 'Medical history', ''],
  ['patient/notifications.html', 'patient-notifications', 'Notifications', ''],
  ['patient/profile.html', 'patient-profile', 'Profile', ''],
  ['patient/settings.html', 'patient-settings', 'Settings', ''],
  ['doctor/dashboard.html', 'doctor-dashboard', 'Schedule', ''],
  ['doctor/appointments.html', 'doctor-appointments', 'Appointments', ''],
  ['doctor/consultation.html', 'doctor-consultation', 'Consultation', ''],
  ['doctor/prescriptions.html', 'doctor-prescriptions', 'Issued prescriptions', ''],
  ['doctor/profile.html', 'doctor-profile', 'Professional profile', ''],
  ['admin/dashboard.html', 'admin-dashboard', 'Operations', '']
];

for (const [file, page, heading, extra] of shells) {
  write(file, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading} · MediCare+</title>
</head>
<body data-page="${page}">
  <a class="skip" href="#content">Skip to content</a>
  <div class="layout">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="workspace">
      <header class="app-top">
        <button class="menu-btn btn-outline" id="menuBtn" type="button">Menu</button>
        <a class="tiny" href="${rel(file, 'index.html')}">Back to home</a>
      </header>
      <main class="main">
        <div class="page-head"><h1>${heading}</h1>${extra}</div>
        <div id="content"></div>
      </main>
    </div>
  </div>
</body>
</html>`);
}
