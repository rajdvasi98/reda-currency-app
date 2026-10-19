import { Router } from 'express';
import { dbGet, dbAll, dbRun } from '../database/init.js';
import { requireShopAuth, requireActivePlan } from '../middleware/shopAuth.js';

const router = Router();

function isValidPercentage(value) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && n >= -90 && n <= 500;
}
router.use(requireShopAuth, requireActivePlan);

// GET /api/pricing-rules
router.get('/', async (req, res) => {
  const rules = await dbAll(
    'SELECT * FROM pricing_rules WHERE shop_id = $1 ORDER BY priority DESC, created_at DESC',
    [req.shopId]
  );
  res.json(rules);
});

// POST /api/pricing-rules
router.post('/', async (req, res) => {
  const { country_code, percentage_adjustment, priority = 0, is_enabled = 1 } = req.body;

  if (!country_code) {
    return res.status(400).json({ error: 'country_code is required' });
  }
  if (!isValidPercentage(percentage_adjustment)) {
    return res.status(400).json({ error: 'Adjustment must be a number between -90 and 500' });
  }

  const created = await dbGet(`
    INSERT INTO pricing_rules
      (shop_id, country_code, rule_type, shopify_resource_id, resource_title, price_override, percentage_adjustment, priority, is_enabled)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [req.shopId, country_code, 'all', null, null, null, Number(percentage_adjustment), priority, is_enabled]);

  res.status(201).json(created);
});

// PUT /api/pricing-rules/:id
router.put('/:id', async (req, res) => {
  const existing = await dbGet(
    'SELECT * FROM pricing_rules WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.shopId]
  );
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  const { country_code, percentage_adjustment, priority, is_enabled } = req.body;
  const adjustment = percentage_adjustment ?? existing.percentage_adjustment;
  if (!isValidPercentage(adjustment)) {
    return res.status(400).json({ error: 'Adjustment must be a number between -90 and 500' });
  }

  await dbRun(`
    UPDATE pricing_rules SET
      country_code = COALESCE($1, country_code),
      rule_type = 'all',
      shopify_resource_id = NULL,
      resource_title = NULL,
      price_override = NULL,
      percentage_adjustment = $2,
      priority = COALESCE($3, priority),
      is_enabled = COALESCE($4, is_enabled),
      updated_at = NOW()
    WHERE id = $5 AND shop_id = $6
  `, [country_code, Number(adjustment), priority, is_enabled, req.params.id, req.shopId]);

  const updated = await dbGet('SELECT * FROM pricing_rules WHERE id = $1', [req.params.id]);
  res.json(updated);
});

// DELETE /api/pricing-rules/:id
router.delete('/:id', async (req, res) => {
  const result = await dbRun(
    'DELETE FROM pricing_rules WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.shopId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Rule not found' });
  res.json({ deleted: true });
});

export default router;
