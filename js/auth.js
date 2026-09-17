'use strict';

(function () {
const { api, toast } = window.Medicare;
const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);

async function handleVerify() {
  const token = params.get('verify');
  if (!token) return;
  try {
    await api('/api/auth/verify-email', { method: 'POST', body: { token } });
    showAuthMessage('Email verified. You can sign in now.', false);
  } catch (err) {
    showAuthMessage(err.message, true);
  }
}

async function handleResetForm() {
  const token = params.get('reset');
  const box = document.getElementById('resetBox');
  if (!token || !box) return;
  box.classList.remove('hidden');
  box.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password: box.password.value }
      });
      toast('Password updated. Sign in with your new password.');
      box.classList.add('hidden');
    } catch (err) {
      toast(err.message);
    }
  });
}

handleVerify();
handleResetForm();

if (document.getElementById('loginForm')) {
  const expected =
    page === 'doctor-login' ? 'doctor' : page === 'admin-login' ? 'admin' : 'patient';
  window.Medicare.api('/api/auth/me').then((data) => {
    if (data.user && data.user.role === expected) {
      location.replace(window.Medicare.homeFor(data.user.role));
    }
  }).catch(() => {});
}

function showAuthMessage(message, danger) {
  const box = document.getElementById('authAlert');
  if (box) {
    box.textContent = message;
    box.className = danger ? 'alert danger' : 'alert';
    box.classList.remove('hidden');
  }
  toast(message);
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.setAttribute('method', 'post');
  loginForm.setAttribute('action', '#');
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email: loginForm.email.value, password: loginForm.password.value }
      });
      const rawNext = params.get('next');
      let nextPath = '';
      if (rawNext) {
        try { nextPath = decodeURIComponent(rawNext); } catch { nextPath = rawNext; }
      }
      if (nextPath.startsWith('/') && !nextPath.startsWith('//') && !nextPath.includes('://')) {
        location.href = nextPath;
      } else {
        location.href = window.Medicare.homeFor(data.user.role);
      }
    } catch (err) {
      showAuthMessage(err.message, true);
    }
  });
}

const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: forgotForm.email.value } });
      toast('If an account exists, reset instructions have been sent.');
    } catch (err) {
      toast(err.message);
    }
  });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(registerForm).entries());
    const path = page === 'doctor-register' ? '/api/auth/register-doctor' : '/api/auth/register-patient';
    try {
      const data = await api(path, { method: 'POST', body });
      if (data.signed_in && data.user) {
        location.href = window.Medicare.homeFor(data.user.role);
        return;
      }
      showAuthMessage(data.message || 'Account created. Please verify your email.', false);
      if (data.verify_url) {
        document.getElementById('devVerify').innerHTML = `<div class="alert">Development verification link: <a href="${data.verify_url}">verify email</a></div>`;
      }
    } catch (err) {
      showAuthMessage(err.message, true);
    }
  });
}
})();
