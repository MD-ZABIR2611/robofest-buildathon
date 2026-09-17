'use strict';

const { query } = require('../utils/db');
const { sendMail } = require('./mail');

async function notify({ userId, type, title, message, resourceType, resourceId, emailTo, emailText }) {
  if (resourceId) {
    const existing = await query(
      `SELECT id FROM notifications WHERE user_id = $1 AND type = $2 AND resource_id = $3 LIMIT 1`,
      [userId, type, resourceId]
    );
    if (existing.rowCount) return existing.rows[0];
  }
  const { rows } = await query(
    `INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, type, title, message, resourceType || null, resourceId || null]
  );
  if (emailTo) {
    await sendMail({
      to: emailTo,
      subject: title,
      text: emailText || message
    });
  }
  return rows[0];
}

module.exports = { notify };
