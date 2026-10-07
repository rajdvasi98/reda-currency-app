/**
 * Exchange rate service.
 * Primary source: open.er-api.com (free tier, no key needed).
 * Fallback: exchangerate.host (in case primary is down).
 * Rates are stored per-shop so each merchant can override individual pairs manually.
 */
import { dbGet, dbAll, dbRun } from '../database/init.js';

const EXCHANGE_RATE_API = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest';

export async function fetchAndStoreRates(shopId, baseCurrency) {
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
    `, [shopId, baseCurrency, toCurrency, rate]);
  }

  return { success: true, count: Object.keys(data.rates).length, base: baseCurrency };
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
