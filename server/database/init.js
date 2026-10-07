import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { currencies } from './seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool;

export function getPool() { return pool; }

export async function initDb() {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  await seedCurrencies();
  console.log('Database initialized (PostgreSQL)');
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

export async function dbGet(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

export async function dbAll(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function dbRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}
