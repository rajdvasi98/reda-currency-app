/**
 * Exchange rate service.
 * Primary source: open.er-api.com (free tier, no key needed).
 * Fallback: exchangerate.host (in case primary is down).
 * Rates are stored per-shop so each merchant can override individual pairs manually.
 */
import fetch from 'node-fetch';
import { getDb } from '../database/init.js';

const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest';

export async function fetchAndStoreRates(shopId, baseCurrency) {
  const db = getDb();
  let data;
  try {
    const res = await fetch(`${EXCHANGE_RATE_API}/${baseCurrency}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    if (!data.rates) throw new Error('No rates in response');
  } catch (err) {
    console.warn('Primary rate API failed, trying fallback:', err.message);
    try {
      const res = await fetch(`https://api.exchangerate.host/latest?base=${baseCurrency}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }

  const stmt = db.prepare(`
    INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source, fetched_at)
    VALUES (@shop_id, @from_currency, @to_currency, @rate, 'auto', CURRENT_TIMESTAMP)
    ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET
      rate = excluded.rate, source = 'auto', fetched_at = CURRENT_TIMESTAMP
  `);

  const upsertAll = db.transaction((rates) => {
    for (const [toCurrency, rate] of Object.entries(rates)) {
      stmt.run({ shop_id: shopId, from_currency: baseCurrency, to_currency: toCurrency, rate });
    }
  });
  upsertAll(data.rates);

  return { success: true, count: Object.keys(data.rates).length, base: baseCurrency };
}

export function getRate(shopId, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;
  const db = getDb();
  const row = db.prepare(
    'SELECT rate FROM exchange_rates WHERE shop_id = ? AND from_currency = ? AND to_currency = ?'
  ).get(shopId, fromCurrency, toCurrency);
  return row?.rate ?? null;
}

export function setManualRate(shopId, fromCurrency, toCurrency, rate) {
  const db = getDb();
  db.prepare(`
    INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source, fetched_at)
    VALUES (?, ?, ?, ?, 'manual', CURRENT_TIMESTAMP)
    ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET
      rate = excluded.rate, source = 'manual', fetched_at = CURRENT_TIMESTAMP
  `).run(shopId, fromCurrency, toCurrency, rate);
}

export function getRatesForShop(shopId) {
  return getDb().prepare('SELECT * FROM exchange_rates WHERE shop_id = ? ORDER BY to_currency').all(shopId);
}
