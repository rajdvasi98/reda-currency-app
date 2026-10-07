import { Router } from 'express';
import { dbGet, dbAll, dbRun } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/countries — list all countries for the shop
router.get('/', async (req, res) => {
  const countries = await dbAll(
    'SELECT * FROM countries WHERE shop_id = $1 ORDER BY country_name', [req.shopId]
  );
  res.json(countries);
});

// POST /api/countries — add a country
router.post('/', async (req, res) => {
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

  try {
    const created = await dbGet(`
      INSERT INTO countries
        (shop_id, country_code, country_name, currency_code, flag_emoji, price_adjustment_type, price_adjustment_value, rounding_rule, is_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [req.shopId, country_code, country_name, currency_code, flag_emoji,
        price_adjustment_type, price_adjustment_value, rounding_rule, is_enabled]);

    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Country already exists for this shop' });
    }
    throw err;
  }
});

// PUT /api/countries/:id — update a country
router.put('/:id', async (req, res) => {
  const existing = await dbGet('SELECT * FROM countries WHERE id = $1 AND shop_id = $2', [req.params.id, req.shopId]);
  if (!existing) return res.status(404).json({ error: 'Country not found' });

  const {
    country_name, currency_code, flag_emoji,
    price_adjustment_type, price_adjustment_value,
    rounding_rule, is_enabled,
  } = req.body;

  await dbRun(`
    UPDATE countries SET
      country_name = COALESCE($1, country_name),
      currency_code = COALESCE($2, currency_code),
      flag_emoji = COALESCE($3, flag_emoji),
      price_adjustment_type = COALESCE($4, price_adjustment_type),
      price_adjustment_value = COALESCE($5, price_adjustment_value),
      rounding_rule = COALESCE($6, rounding_rule),
      is_enabled = COALESCE($7, is_enabled),
      updated_at = NOW()
    WHERE id = $8 AND shop_id = $9
  `, [country_name, currency_code, flag_emoji,
      price_adjustment_type, price_adjustment_value,
      rounding_rule, is_enabled,
      req.params.id, req.shopId]);

  const updated = await dbGet('SELECT * FROM countries WHERE id = $1', [req.params.id]);
  res.json(updated);
});

// DELETE /api/countries/:id
router.delete('/:id', async (req, res) => {
  const result = await dbRun('DELETE FROM countries WHERE id = $1 AND shop_id = $2', [req.params.id, req.shopId]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Country not found' });
  res.json({ deleted: true });
});

export default router;
