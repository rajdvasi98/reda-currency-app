import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { currencies } from './seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() { return db; }

export function initDb(dbPath) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrate: add columns introduced after initial schema
  try { db.exec('ALTER TABLE shops ADD COLUMN refresh_token TEXT'); } catch {}
  try { db.exec('ALTER TABLE shops ADD COLUMN token_expires_at DATETIME'); } catch {}

  seedCurrencies();
  console.log('Database initialized:', dbPath);
  return db;
}

function seedCurrencies() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO currencies
      (code, name, symbol, symbol_position, decimal_places, thousand_separator, decimal_separator)
    VALUES
      (@code, @name, @symbol, @symbol_position, @decimal_places, @thousand_separator, @decimal_separator)
  `);
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });
  insertMany(currencies);
}
