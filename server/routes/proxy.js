/**
 * Public storefront proxy API.
 * These endpoints are called directly by the storefront widget (currency-widget.js)
 * with no auth — they're read-only and rate-limited by the CDN cache headers.
 *
 *   GET /api/proxy/config   → full widget config (countries, rates, settings)
 *   GET /api/proxy/detect   → detect visitor country by IP
 *   GET /api/proxy/prices   → batch-convert prices for a list of amounts
 */
import { Router } from 'express';
import { dbGet, dbAll, parseDbTime } from '../database/init.js';
import { detectCountry, extractClientIp } from '../services/geolocation.js';
import { convertPrice } from '../services/priceConverter.js';

const router = Router();

// Matches the plan trial, so a new install can be tried on the storefront before approving a plan.
const INSTALL_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The widget runs for installed shops with an active plan, or within 7 days of installing.
 * An inactive shop is a normal state, not an error, so callers answer 200 with `active: false`.
 */
async function getStorefrontShop(shop) {
  const row = await dbGet(`
    SELECT s.*, sub.status AS plan_status FROM shops s
    LEFT JOIN subscriptions sub ON sub.shop_id = s.id
    WHERE s.shop_domain = $1 AND s.is_active = 1
  `, [shop]);
  if (!row) return { shopRow: null, reason: 'not_installed' };
  if (row.plan_status === 'active') return { shopRow: row };
  const installedAt = parseDbTime(row.installed_at);
  if (installedAt && Date.now() - installedAt.getTime() < INSTALL_GRACE_MS) return { shopRow: row };
  return { shopRow: null, reason: 'plan_required' };
}

function setPublicHeaders(res) {
  res.set('Cache-Control', 'public, max-age=30');
  res.set('Access-Control-Allow-Origin', '*');
}

/**
 * GET /api/proxy/config?shop=
 * Returns all config the widget needs: countries, currencies, rates, settings.
 * Called once on page load by the widget.
 */
router.get('/config', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  const { shopRow, reason } = await getStorefrontShop(shop);
  setPublicHeaders(res);
  if (!shopRow) return res.json({ active: false, reason });

  const countries = await dbAll(
    'SELECT * FROM countries WHERE shop_id = $1 AND is_enabled = 1 ORDER BY country_name',
    [shopRow.id]
  );

  const currencies = await dbAll('SELECT * FROM currencies', []);
  const currencyMap = Object.fromEntries(currencies.map(c => [c.code, c]));

  const rates = await dbAll(
    'SELECT to_currency, rate FROM exchange_rates WHERE shop_id = $1 AND from_currency = $2',
    [shopRow.id, shopRow.default_currency]
  );
  const rateMap = Object.fromEntries(rates.map(r => [r.to_currency, r.rate]));

  const settings = await dbGet('SELECT * FROM settings WHERE shop_id = $1', [shopRow.id]) || {};

  // Highest-priority enabled "all products" percentage rule per country (same order as convertPrice).
  const ruleRows = await dbAll(`
    SELECT country_code, percentage_adjustment FROM pricing_rules
    WHERE shop_id = $1 AND is_enabled = 1 AND rule_type = 'all' AND percentage_adjustment IS NOT NULL
    ORDER BY priority DESC, id ASC
  `, [shopRow.id]);
  const rules = {};
  for (const r of ruleRows) if (!(r.country_code in rules)) rules[r.country_code] = r.percentage_adjustment;

  res.json({
    active: true,
    shop: shop,
    baseCurrency: shopRow.default_currency,
    countries,
    currencies: currencyMap,
    rates: rateMap,
    rules,
    settings: {
      autoDetect: settings.auto_detect_enabled ?? 1,
      widgetPosition: settings.widget_position || 'bottom-left',
      widgetBgColor: settings.widget_bg_color || '#ffffff',
      widgetTextColor: settings.widget_text_color || '#1a1a1a',
      widgetAccentColor: settings.widget_accent_color || '#3b82f6',
      fallbackCountry: settings.fallback_country || 'US',
      showFlags: settings.show_flags ?? 1,
      showCountryName: settings.show_country_name ?? 1,
    },
  });
});

/**
 * GET /api/proxy/detect?shop=
 * Detect the visitor's country by IP.
 */
router.get('/detect', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  res.set('Access-Control-Allow-Origin', '*');
  const { shopRow, reason } = await getStorefrontShop(shop);
  if (!shopRow) return res.json({ active: false, reason, detected: false });

  const ip = extractClientIp(req);
  const geoResult = await detectCountry(ip);

  if (geoResult.countryCode) {
    const country = await dbGet(
      'SELECT * FROM countries WHERE shop_id = $1 AND country_code = $2 AND is_enabled = 1',
      [shopRow.id, geoResult.countryCode]
    );
    if (country) {
      return res.json({ active: true, detected: true, country, source: geoResult.source });
    }
  }

  res.json({ active: true, detected: false, countryCode: geoResult.countryCode, source: geoResult.source });
});

/**
 * GET /api/proxy/prices?shop=&country=&prices=100,200,300
 * Convert a list of prices (comma-separated, in base currency cents) to target country currency.
 */
router.get('/prices', async (req, res) => {
  const { shop, country: countryCode, prices: pricesParam } = req.query;
  if (!shop || !countryCode || !pricesParam) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  res.set('Access-Control-Allow-Origin', '*');
  const { shopRow, reason } = await getStorefrontShop(shop);
  if (!shopRow) return res.json({ active: false, reason, results: [] });

  const basePrices = pricesParam.split(',').map(Number).filter(n => !isNaN(n));

  const results = await Promise.all(basePrices.map(async (basePrice) => {
    // Shopify prices are in cents; convert to decimal
    const priceDecimal = basePrice / 100;
    const result = await convertPrice(shopRow.id, priceDecimal, shopRow.default_currency, countryCode);
    return {
      original: basePrice,
      converted: Math.round(result.price * 100),
      currency: result.currency,
    };
  }));

  res.json({ active: true, results });
});

export default router;
