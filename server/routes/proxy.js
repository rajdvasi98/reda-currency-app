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
import { getDb } from '../database/init.js';
import { detectCountry, extractClientIp } from '../services/geolocation.js';
import { convertPrice } from '../services/priceConverter.js';

const router = Router();

/**
 * GET /api/proxy/config?shop=
 * Returns all config the widget needs: countries, currencies, rates, settings.
 * Called once on page load by the widget.
 */
router.get('/config', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ? AND is_active = 1').get(shop);
  if (!shopRow) return res.status(404).json({ error: 'Shop not found' });

  const countries = db.prepare(
    'SELECT * FROM countries WHERE shop_id = ? AND is_enabled = 1 ORDER BY country_name'
  ).all(shopRow.id);

  const currencies = db.prepare('SELECT * FROM currencies').all();
  const currencyMap = Object.fromEntries(currencies.map(c => [c.code, c]));

  const rates = db.prepare(
    'SELECT to_currency, rate FROM exchange_rates WHERE shop_id = ? AND from_currency = ?'
  ).all(shopRow.id, shopRow.default_currency);
  const rateMap = Object.fromEntries(rates.map(r => [r.to_currency, r.rate]));

  const settings = db.prepare('SELECT * FROM settings WHERE shop_id = ?').get(shopRow.id) || {};

  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.set('Access-Control-Allow-Origin', '*');
  res.json({
    shop: shop,
    baseCurrency: shopRow.default_currency,
    countries,
    currencies: currencyMap,
    rates: rateMap,
    settings: {
      autoDetect: settings.auto_detect_enabled ?? 1,
      widgetPosition: settings.widget_position || 'bottom-left',
      widgetBgColor: settings.widget_bg_color || '#1a1a2e',
      widgetTextColor: settings.widget_text_color || '#ffffff',
      widgetAccentColor: settings.widget_accent_color || '#e94560',
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

  const ip = extractClientIp(req);
  const geoResult = await detectCountry(ip);

  // Find matching country in shop config
  if (geoResult.countryCode) {
    const db = getDb();
    const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ? AND is_active = 1').get(shop);
    if (shopRow) {
      const country = db.prepare(
        'SELECT * FROM countries WHERE shop_id = ? AND country_code = ? AND is_enabled = 1'
      ).get(shopRow.id, geoResult.countryCode);

      if (country) {
        return res.json({ detected: true, country, source: geoResult.source });
      }
    }
  }

  res.json({ detected: false, countryCode: geoResult.countryCode, source: geoResult.source });
});

/**
 * GET /api/proxy/prices?shop=&country=&prices=100,200,300
 * Convert a list of prices (comma-separated, in base currency cents) to target country currency.
 */
router.get('/prices', (req, res) => {
  const { shop, country: countryCode, prices: pricesParam } = req.query;
  if (!shop || !countryCode || !pricesParam) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ? AND is_active = 1').get(shop);
  if (!shopRow) return res.status(404).json({ error: 'Shop not found' });

  const basePrices = pricesParam.split(',').map(Number).filter(n => !isNaN(n));

  const results = basePrices.map(basePrice => {
    // Shopify prices are in cents; convert to decimal
    const priceDecimal = basePrice / 100;
    const result = convertPrice(shopRow.id, priceDecimal, shopRow.default_currency, countryCode);
    return {
      original: basePrice,
      converted: Math.round(result.price * 100),
      currency: result.currency,
    };
  });

  res.set('Access-Control-Allow-Origin', '*');
  res.json({ results });
});

export default router;
