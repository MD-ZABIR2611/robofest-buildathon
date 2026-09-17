'use strict';

const fs = require('fs');
const path = require('path');
const { runSqlFile, query } = require('../../server/utils/db');

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const dir = path.join(__dirname, '../schema');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (applied.rowCount) {
      console.log('Already applied', file);
      continue;
    }
    await runSqlFile(path.join(dir, file));
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log('Applied', file);
  }
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
