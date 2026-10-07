/**
 * Test-only routes — only mounted when NODE_ENV=test or NODE_ENV=development.
 * NEVER expose in production.
 */
import { Router } from 'express';
import { getDb } from '../database/init.js';
import { defaultCountries } from '../database/seeds.js';

const router = Router();

/**
 * POST /api/test/seed-shop
 * Create a test shop with default countries and settings.
 */
router.post('/seed-shop', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { shop, currency = 'USD' } = req.body;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });

  const db = getDb();

  db.prepare(`
    INSERT INTO shops (shop_domain, access_token, default_currency, is_active)
    VALUES (?, 'test_token', ?, 1)
    ON CONFLICT(shop_domain) DO UPDATE SET
      is_active = 1, default_currency = excluded.default_currency,
      updated_at = CURRENT_TIMESTAMP
  `).run(shop, currency);

  const shopRow = db.prepare('SELECT id FROM shops WHERE shop_domain = ?').get(shop);
  const shopId = shopRow.id;

  db.prepare('INSERT OR IGNORE INTO settings (shop_id) VALUES (?)').run(shopId);

  const insertCountry = db.prepare(`
    INSERT OR IGNORE INTO countries (shop_id, country_code, country_name, currency_code, flag_emoji)
    VALUES (@shop_id, @country_code, @country_name, @currency_code, @flag_emoji)
  `);
  for (const c of defaultCountries) insertCountry.run({ shop_id: shopId, ...c });

  // Insert some exchange rates for testing
  const rates = { INR: 83.5, GBP: 0.79, CAD: 1.37, AUD: 1.55, AED: 3.67, SGD: 1.35, EUR: 0.93 };
  const rateStmt = db.prepare(`
    INSERT INTO exchange_rates (shop_id, from_currency, to_currency, rate, source)
    VALUES (?, 'USD', ?, ?, 'auto')
    ON CONFLICT(shop_id, from_currency, to_currency) DO UPDATE SET rate = excluded.rate
  `);
  for (const [to, rate] of Object.entries(rates)) rateStmt.run(shopId, to, rate);

  res.json({ shopId, shop, currency });
});

/**
 * DELETE /api/test/cleanup?shop=
 * Remove test shop data.
 */
router.delete('/cleanup', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });
  const db = getDb();
  const shopRow = db.prepare('SELECT id FROM shops WHERE shop_domain = ?').get(shop);
  if (shopRow) db.prepare('DELETE FROM shops WHERE id = ?').run(shopRow.id);
  res.json({ deleted: true });
});

export default router;
