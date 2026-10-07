/**
 * Thin compatibility wrapper around node:sqlite to match better-sqlite3's named-param API.
 * Converts @named params to positional ? and maps the object's values.
 */
import { DatabaseSync } from 'node:sqlite';

let _db = null;

export function getDb() { return _db; }

export function initDbSync(path) {
  _db = new DatabaseSync(path);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  return _db;
}

/**
 * Prepare a statement with named @params and return a bsl-compatible object.
 * node:sqlite uses positional params but we convert named -> positional at call time.
 */
export function prepare(sql) {
  // Extract @param names in order of appearance
  const paramNames = [];
  const positional = sql.replace(/@(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '?';
  });

  const stmt = _db.prepare(positional);

  function toPositional(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (paramNames.length === 0) return Object.values(data);
    return paramNames.map(k => {
      if (k in data) return data[k];
      // Also accept camelCase -> snake_case mapping attempt
      return data[k] ?? null;
    });
  }

  return {
    run(data) {
      return stmt.run(...toPositional(data));
    },
    get(data) {
      if (arguments.length === 0) {
        return stmt.get();
      }
      if (Array.isArray(data) || typeof data !== 'object' || data === null) {
        // Positional args passed directly
        return stmt.get(...(Array.isArray(data) ? data : [data, ...Array.from({length: arguments.length - 1}, (_, i) => arguments[i+1])]));
      }
      return stmt.get(...toPositional(data));
    },
    all(data) {
      if (arguments.length === 0) {
        return stmt.all();
      }
      if (Array.isArray(data) || typeof data !== 'object' || data === null) {
        return stmt.all(...(Array.isArray(data) ? data : Array.from(arguments)));
      }
      return stmt.all(...toPositional(data));
    },
  };
}
