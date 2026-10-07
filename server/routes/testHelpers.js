/**
 * Test-only routes — only mounted when NODE_ENV=test or NODE_ENV=development.
 * NEVER expose in production.
 */
import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { defaultCountries } from '../database/seeds.js';

const router = Router();

/**
 * POST /api/test/seed-shop
 * Create a test shop with default countries and settings.
 */
router.post('/seed-shop', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { shop, currency = 'USD' } = req.body;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  await dbRun(`
    INSERT INTO shops (shop_domain, access_token, default_currency, is_active)
    VALUES ($1, 'test_token', $2, 1)
    ON CONFLICT(shop_domain) DO UPDATE SET
      is_active = 1, default_currency = excluded.default_currency,
      updated_at = NOW()
  `, [shop, currency]);

  const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
  const shopId = shopRow.id;

  await dbRun('INSERT INTO settings (shop_id) VALUES ($1) ON CONFLICT DO NOTHING', [shopId]);

  for (const c of defaultCountries) {
    await dbRun(`
      INSERT INTO countries (shop_id, country_code, country_name, currency_code, flag_emoji)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [shopId, c.country_code, c.country_name, c.currency_code, c.flag_emoji]);
  }

  // Insert some exchange rates for testing
  const rates = { INR: 83.5, GBP: 0.79, CAD: 1.37, AUD: 1.55, AED: 3.67, SGD: 1.35, EUR: 0.93 };
  for (const [to, rate] of Object.entries(rates)) {
    await dbRun(`
      INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source)
      VALUES ($1, 'USD', $2, $3, 'auto')
      ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET rate = excluded.rate
    `, [shopId, to, rate]);
  }

  res.json({ shopId, shop, currency });
});

/**
 * DELETE /api/test/cleanup?shop=
 * Remove test shop data.
 */
router.delete('/cleanup', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
  if (shopRow) await dbRun('DELETE FROM shops WHERE id = $1', [shopRow.id]);
  res.json({ deleted: true });
});

export default router;
