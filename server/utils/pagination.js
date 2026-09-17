'use strict';

function pagination(req, defaults = { limit: 20, max: 50 }) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(defaults.max, Math.max(1, Number.parseInt(req.query.limit, 10) || defaults.limit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginated(rows, total, { page, limit }) {
  return {
    items: rows,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit) || 1
  };
}

module.exports = { pagination, paginated };
