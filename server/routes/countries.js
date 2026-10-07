import { Router } from 'express';
import { getDb } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/countries — list all countries for the shop
router.get('/', (req, res) => {
  const db = getDb();
  const countries = db.prepare(
    'SELECT * FROM countries WHERE shop_id = ? ORDER BY country_name'
  ).all(req.shopId);
  res.json(countries);
});

// POST /api/countries — add a country
router.post('/', (req, res) => {
  const {
    country_code, country_name, currency_code, flag_emoji = '',
    price_adjustment_type = 'exchange_rate',
    price_adjustment_value = 0,
    rounding_rule = 'none',
    is_enabled = 1,
  } = req.body;

  if (!country_code || !country_name || !currency_code) {
    return res.status(400).json({ error: 'country_code, country_name, and currency_code are required' });
  }

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO countries
        (shop_id, country_code, country_name, currency_code, flag_emoji, price_adjustment_type, price_adjustment_value, rounding_rule, is_enabled)
      VALUES
        (@shop_id, @country_code, @country_name, @currency_code, @flag_emoji, @price_adjustment_type, @price_adjustment_value, @rounding_rule, @is_enabled)
    `).run({
      shop_id: req.shopId, country_code, country_name, currency_code, flag_emoji,
      price_adjustment_type, price_adjustment_value, rounding_rule, is_enabled,
    });

    const created = db.prepare('SELECT * FROM countries WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Country already exists for this shop' });
    }
    throw err;
  }
});

// PUT /api/countries/:id — update a country
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM countries WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!existing) return res.status(404).json({ error: 'Country not found' });

  const {
    country_name, currency_code, flag_emoji,
    price_adjustment_type, price_adjustment_value,
    rounding_rule, is_enabled,
  } = req.body;

  db.prepare(`
    UPDATE countries SET
      country_name = COALESCE(@country_name, country_name),
      currency_code = COALESCE(@currency_code, currency_code),
      flag_emoji = COALESCE(@flag_emoji, flag_emoji),
      price_adjustment_type = COALESCE(@price_adjustment_type, price_adjustment_type),
      price_adjustment_value = COALESCE(@price_adjustment_value, price_adjustment_value),
      rounding_rule = COALESCE(@rounding_rule, rounding_rule),
      is_enabled = COALESCE(@is_enabled, is_enabled),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND shop_id = @shop_id
  `).run({
    id: req.params.id, shop_id: req.shopId,
    country_name, currency_code, flag_emoji,
    price_adjustment_type, price_adjustment_value,
    rounding_rule, is_enabled,
  });

  const updated = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/countries/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM countries WHERE id = ? AND shop_id = ?').run(req.params.id, req.shopId);
  if (result.changes === 0) return res.status(404).json({ error: 'Country not found' });
  res.json({ deleted: true });
});

export default router;
