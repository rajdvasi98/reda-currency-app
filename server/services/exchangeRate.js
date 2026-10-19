/**
 * Exchange rate service.
 * Primary source: open.er-api.com (free tier, no key needed).
 * Fallback: exchangerate.host (in case primary is down).
 * Rates are stored per-shop so each merchant can override individual pairs manually.
 */
import { dbGet, dbAll, dbRun } from '../database/init.js';

const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest';

export async function fetchAndStoreRates(shopId, baseCurrency, { keepManual = false } = {}) {
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

  for (const [toCurrency, rate] of Object.entries(data.rates)) {
    await dbRun(`
      INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source, fetched_at)
      VALUES ($1, $2, $3, $4, 'auto', NOW())
      ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET
        rate = excluded.rate, source = 'auto', fetched_at = NOW()
      ${keepManual ? "WHERE exchange_rates.source <> 'manual'" : ''}
    `, [shopId, baseCurrency, toCurrency, rate]);
  }

  return { success: true, count: Object.keys(data.rates).length, base: baseCurrency };
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`);
}

async function refreshDueShops() {
  const shops = await dbAll(`
    SELECT s.id, s.default_currency, st.rate_update_interval
    FROM shops s
    JOIN settings st ON st.shop_id = s.id
    JOIN subscriptions sub ON sub.shop_id = s.id AND sub.status = 'active'
    WHERE s.is_active = 1 AND st.auto_update_rates = 1
  `);
  for (const shop of shops) {
    const last = await dbGet(
      "SELECT MAX(fetched_at) AS last FROM exchange_rates WHERE shop_id = $1 AND source = 'auto'",
      [shop.id]
    );
    const intervalMs = Math.max(1, shop.rate_update_interval || 24) * 60 * 60 * 1000;
    const lastFetch = toDate(last?.last);
    if (lastFetch && Date.now() - lastFetch.getTime() < intervalMs) continue;
    const result = await fetchAndStoreRates(shop.id, shop.default_currency, { keepManual: true });
    if (!result.success) console.warn(`[Rates] Scheduled refresh failed for shop ${shop.id}:`, result.error);
  }
}

export function startRateScheduler() {
  const run = () => refreshDueShops().catch(err => console.error('[Rates] Scheduler error:', err.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
}

export async function getRate(shopId, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;
  const row = await dbGet(
    'SELECT rate FROM exchange_rates WHERE shop_id = $1 AND from_currency = $2 AND to_currency = $3',
    [shopId, fromCurrency, toCurrency]
  );
  return row?.rate ?? null;
}

export async function setManualRate(shopId, fromCurrency, toCurrency, rate) {
  await dbRun(`
    INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source, fetched_at)
    VALUES ($1, $2, $3, $4, 'manual', NOW())
    ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET
      rate = excluded.rate, source = 'manual', fetched_at = NOW()
  `, [shopId, fromCurrency, toCurrency, rate]);
}

export async function getRatesForShop(shopId) {
  return await dbAll('SELECT * FROM exchange_rates WHERE shop_id = $1 ORDER BY to_currency', [shopId]);
}
