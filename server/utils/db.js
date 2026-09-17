'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const needsSsl = /sslmode=require/i.test(url) || /neon\.tech|amazonaws\.com|supabase|render\.com/i.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined
  });
}

let pool;

function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await query(sql);
}

module.exports = {
  getPool,
  query,
  withTransaction,
  runSqlFile
};
