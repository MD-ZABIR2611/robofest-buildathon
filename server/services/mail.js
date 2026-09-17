'use strict';

const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  if (!process.env.EMAIL_HOST) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: String(process.env.EMAIL_PORT) === '465',
    auth: process.env.EMAIL_USER
      ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
      : undefined
  });
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const from = process.env.EMAIL_FROM || 'MediCare+ <noreply@medicare.local>';
  const tx = getTransporter();
  if (!tx) {
    console.log('[mail:dev]', { to, subject, text });
    return { delivered: false, dev: true };
  }
  await tx.sendMail({ from, to, subject, text });
  return { delivered: true };
}

function publicBase() {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

module.exports = { sendMail, publicBase };
