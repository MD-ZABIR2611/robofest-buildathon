'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { query } = require('../utils/db');
const { pagination, paginated } = require('../utils/pagination');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req, { limit: 20, max: 50 });
    const unread = String(req.query.unread || '') === '1';
    const extra = unread ? 'AND read = FALSE' : '';
    const count = await query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 ${extra}`,
      [req.user.id]
    );
    const { rows } = await query(
      `SELECT id, type, title, message, read, created_at
       FROM notifications
       WHERE user_id = $1 ${extra}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    const unreadCount = await query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read = FALSE`,
      [req.user.id]
    );
    res.json({
      success: true,
      data: { ...paginated(rows, count.rows[0].n, { page, limit }), unread: unreadCount.rows[0].n }
    });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await query(`UPDATE notifications SET read = TRUE WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true, data: { ok: true } });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id
    ]);
    res.json({ success: true, data: { ok: true } });
  })
);

module.exports = router;
