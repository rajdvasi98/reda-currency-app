import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { currencies } from './seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool = null;
let sqliteDb = null;
let ready = false;

export function getPool() { return pool; }
export function isDbReady() { return ready; }

// PostgreSQL returns Date objects; SQLite returns 'YYYY-MM-DD HH:MM:SS' text in UTC.
export function parseDbTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

// Convert PostgreSQL $1/$2 placeholders and NOW() to SQLite equivalents
function pgToSqlite(sql) {
  return sql
    .replace(/\$(\d+)/g, '?$1')
    .replace(/\bNOW\(\)/gi, "datetime('now')");
}

// pg currently treats sslmode=require as verify-full (full certificate check) and warns that its
// next major version will weaken it to libpq's "encrypt, don't verify". Ask for verify-full
// explicitly: same behavior today, no warning, and no silent downgrade later.
function strictSsl(url) {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full');
}

export async function initDb() {
  try {
    await connect();
    ready = true;
  } catch (err) {
    // Leave no half-open pool behind so the next attempt starts clean.
    if (pool) await pool.end().catch(() => {});
    pool = null;
    sqliteDb = null;
    throw err;
  }
}

async function connect() {
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: strictSsl(process.env.DATABASE_URL),
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 10,
      // Serverless Postgres (Neon) suspends when idle and drops open connections; release idle
      // clients early and allow time for a cold start.
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
    });
    // Without a listener, a dropped idle connection emits an unhandled 'error' and kills the process.
    pool.on('error', err => console.warn('[DB] Idle connection closed:', err.message));
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    await pool.query(`
      ALTER TABLE settings ALTER COLUMN widget_bg_color SET DEFAULT '#ffffff';
      ALTER TABLE settings ALTER COLUMN widget_text_color SET DEFAULT '#1a1a1a';
      ALTER TABLE settings ALTER COLUMN widget_accent_color SET DEFAULT '#3b82f6';
      UPDATE settings SET widget_bg_color = '#ffffff', widget_text_color = '#1a1a1a', widget_accent_color = '#3b82f6'
        WHERE widget_bg_color = '#1a1a2e' AND widget_text_color = '#ffffff' AND widget_accent_color = '#e94560';
    `);
    await seedCurrencies();
    console.log('Database initialized (PostgreSQL)');
  } else {
    const { default: initSqlJs } = await import('sql.js');
    const SQL = await initSqlJs();
    sqliteDb = new SQL.Database();
    const schema = readFileSync(join(__dirname, 'schema-sqlite.sql'), 'utf8');
    sqliteDb.run(schema);
    seedCurrenciesSqlite();
    console.log('Database initialized (SQLite in-memory — set DATABASE_URL env var for PostgreSQL)');
  }
}

async function seedCurrencies() {
  for (const c of currencies) {
    await pool.query(
      `INSERT INTO currencies (code, name, symbol, symbol_position, decimal_places, thousand_separator, decimal_separator)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO NOTHING`,
      [c.code, c.name, c.symbol, c.symbol_position, c.decimal_places, c.thousand_separator, c.decimal_separator]
    );
  }
}

function seedCurrenciesSqlite() {
  const stmt = sqliteDb.prepare(
    `INSERT OR IGNORE INTO currencies (code, name, symbol, symbol_position, decimal_places, thousand_separator, decimal_separator)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const c of currencies) {
    stmt.run([c.code, c.name, c.symbol, c.symbol_position, c.decimal_places, c.thousand_separator, c.decimal_separator]);
  }
  stmt.free();
}

// pg sends undefined as NULL; sql.js throws on it.
const toSqliteParams = params => params.map(v => (v === undefined ? null : v));

function sqliteGetOne(sql, params) {
  const stmt = sqliteDb.prepare(pgToSqlite(sql));
  stmt.bind(toSqliteParams(params));
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function sqliteGetAll(sql, params) {
  const stmt = sqliteDb.prepare(pgToSqlite(sql));
  stmt.bind(toSqliteParams(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Mirror the pg result/error shape callers rely on: rowCount, and 23505 for unique violations.
function sqliteExec(sql, params) {
  sqliteDb.run(pgToSqlite(sql), toSqliteParams(params));
  return { rowCount: sqliteDb.getRowsModified() };
}

function withPgErrors(fn) {
  try {
    return fn();
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) err.code = '23505';
    throw err;
  }
}

export async function dbGet(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  }
  return withPgErrors(() => sqliteGetOne(sql, params));
}

export async function dbAll(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }
  return withPgErrors(() => sqliteGetAll(sql, params));
}

export async function dbRun(sql, params = []) {
  if (pool) {
    return await pool.query(sql, params);
  }
  return withPgErrors(() => sqliteExec(sql, params));
}
