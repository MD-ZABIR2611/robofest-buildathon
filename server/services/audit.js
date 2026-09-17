'use strict';

const { query } = require('../utils/db');

async function audit(req, action, resourceType, resourceId) {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.ip) || null;
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user?.id || null, action, resourceType || null, resourceId || null, ip]
    );
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

module.exports = { audit };
