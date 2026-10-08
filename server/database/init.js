import pg from 'pg';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { currencies } from './seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool = null;
let sqlite = null;

export function getPool() { return pool; }

// Convert PostgreSQL $1, $2 placeholders and NOW() to SQLite equivalents
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
    const { default: Database } = await import('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH || '/tmp/currency.db';
    mkdirSync(dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    const schema = readFileSync(join(__dirname, 'schema-sqlite.sql'), 'utf8');
    sqlite.exec(schema);
    seedCurrenciesSqlite();
    console.log('Database initialized (SQLite fallback — set DATABASE_URL for PostgreSQL)');
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
  const stmt = sqlite.prepare(
    `INSERT OR IGNORE INTO currencies (code, name, symbol, symbol_position, decimal_places, thousand_separator, decimal_separator)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const c of currencies) {
    stmt.run(c.code, c.name, c.symbol, c.symbol_position, c.decimal_places, c.thousand_separator, c.decimal_separator);
  }
}

export async function dbGet(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  }
  return sqlite.prepare(pgToSqlite(sql)).get(...params) ?? null;
}

export async function dbAll(sql, params = []) {
  if (pool) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }
  return sqlite.prepare(pgToSqlite(sql)).all(...params);
}

export async function dbRun(sql, params = []) {
  if (pool) {
    return await pool.query(sql, params);
  }
  return sqlite.prepare(pgToSqlite(sql)).run(...params);
}
