import { Router } from 'express';
import { getDb } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/pricing-rules
router.get('/', (req, res) => {
  const db = getDb();
  const rules = db.prepare(
    'SELECT * FROM pricing_rules WHERE shop_id = ? ORDER BY priority DESC, created_at DESC'
  ).all(req.shopId);
  res.json(rules);
});

// POST /api/pricing-rules
router.post('/', (req, res) => {
  const {
    country_code, rule_type = 'all',
    shopify_resource_id = null, resource_title = null,
    price_override = null, percentage_adjustment = null,
    priority = 0, is_enabled = 1,
  } = req.body;

  if (!country_code) {
    return res.status(400).json({ error: 'country_code is required' });
  }
  if (price_override == null && percentage_adjustment == null) {
    return res.status(400).json({ error: 'Either price_override or percentage_adjustment is required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pricing_rules
      (shop_id, country_code, rule_type, shopify_resource_id, resource_title, price_override, percentage_adjustment, priority, is_enabled)
    VALUES
      (@shop_id, @country_code, @rule_type, @shopify_resource_id, @resource_title, @price_override, @percentage_adjustment, @priority, @is_enabled)
  `).run({
    shop_id: req.shopId, country_code, rule_type,
    shopify_resource_id, resource_title,
    price_override, percentage_adjustment, priority, is_enabled,
  });

  const created = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/pricing-rules/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM pricing_rules WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  const {
    country_code, rule_type, shopify_resource_id, resource_title,
    price_override, percentage_adjustment, priority, is_enabled,
  } = req.body;

  db.prepare(`
    UPDATE pricing_rules SET
      country_code = COALESCE(@country_code, country_code),
      rule_type = COALESCE(@rule_type, rule_type),
      shopify_resource_id = @shopify_resource_id,
      resource_title = @resource_title,
      price_override = @price_override,
      percentage_adjustment = @percentage_adjustment,
      priority = COALESCE(@priority, priority),
      is_enabled = COALESCE(@is_enabled, is_enabled),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND shop_id = @shop_id
  `).run({
    id: req.params.id, shop_id: req.shopId,
    country_code, rule_type, shopify_resource_id, resource_title,
    price_override: price_override ?? existing.price_override,
    percentage_adjustment: percentage_adjustment ?? existing.percentage_adjustment,
    priority, is_enabled,
  });

  const updated = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/pricing-rules/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM pricing_rules WHERE id = ? AND shop_id = ?').run(req.params.id, req.shopId);
  if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
  res.json({ deleted: true });
});

export default router;
