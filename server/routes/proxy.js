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
import { dbGet, dbAll } from '../database/init.js';
import { detectCountry, extractClientIp } from '../services/geolocation.js';
import { convertPrice } from '../services/priceConverter.js';

const router = Router();

/**
 * GET /api/proxy/config?shop=
 * Returns all config the widget needs: countries, currencies, rates, settings.
 * Called once on page load by the widget.
 */
router.get('/config', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1 AND is_active = 1', [shop]);
  if (!shopRow) return res.status(404).json({ error: 'Shop not found' });

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
    const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1 AND is_active = 1', [shop]);
    if (shopRow) {
      const country = await dbGet(
        'SELECT * FROM countries WHERE shop_id = $1 AND country_code = $2 AND is_enabled = 1',
        [shopRow.id, geoResult.countryCode]
      );

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
router.get('/prices', async (req, res) => {
  const { shop, country: countryCode, prices: pricesParam } = req.query;
  if (!shop || !countryCode || !pricesParam) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1 AND is_active = 1', [shop]);
  if (!shopRow) return res.status(404).json({ error: 'Shop not found' });

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

  res.set('Access-Control-Allow-Origin', '*');
  res.json({ results });
});

export default router;
