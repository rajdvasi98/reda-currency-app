import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { currencies } from './seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool = null;
let sqliteDb = null;

export function getPool() { return pool; }

// Convert PostgreSQL $1/$2 placeholders and NOW() to SQLite equivalents
function pgToSqlite(sql) {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/\bNOW\(\)/gi, "datetime('now')");
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
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

function sqliteGetOne(sql, params) {
  const stmt = sqliteDb.prepare(pgToSqlite(sql));
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function sqliteGetAll(sql, params) {
  const stmt = sqliteDb.prepare(pgToSqlite(sql));
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function sqliteExec(sql, params) {
  sqliteDb.run(pgToSqlite(sql), params);
}

export async function dbGet(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  }
  return sqliteGetOne(sql, params);
}

export async function dbAll(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }
  return sqliteGetAll(sql, params);
}

export async function dbRun(sql, params = []) {
  if (pool) {
    return await pool.query(sql, params);
  }
  sqliteExec(sql, params);
}
