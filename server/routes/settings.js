import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/settings
router.get('/', async (req, res) => {
  const settings = await dbGet('SELECT * FROM settings WHERE shop_id = $1', [req.shopId]);
  res.json(settings || {});
});

// PUT /api/settings
router.put('/', async (req, res) => {
  const {
    auto_detect_enabled, widget_position,
    widget_bg_color, widget_text_color, widget_accent_color,
    auto_update_rates, rate_update_interval,
    fallback_country, show_flags, show_country_name,
  } = req.body;

  await dbRun(`
    INSERT INTO settings (shop_id, auto_detect_enabled, widget_position, widget_bg_color, widget_text_color, widget_accent_color, auto_update_rates, rate_update_interval, fallback_country, show_flags, show_country_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(shop_id) DO UPDATE SET
      auto_detect_enabled = COALESCE($2, settings.auto_detect_enabled),
      widget_position = COALESCE($3, settings.widget_position),
      widget_bg_color = COALESCE($4, settings.widget_bg_color),
      widget_text_color = COALESCE($5, settings.widget_text_color),
      widget_accent_color = COALESCE($6, settings.widget_accent_color),
      auto_update_rates = COALESCE($7, settings.auto_update_rates),
      rate_update_interval = COALESCE($8, settings.rate_update_interval),
      fallback_country = COALESCE($9, settings.fallback_country),
      show_flags = COALESCE($10, settings.show_flags),
      show_country_name = COALESCE($11, settings.show_country_name),
      updated_at = NOW()
  `, [
    req.shopId, auto_detect_enabled, widget_position,
    widget_bg_color, widget_text_color, widget_accent_color,
    auto_update_rates, rate_update_interval,
    fallback_country, show_flags, show_country_name,
  ]);

  const updated = await dbGet('SELECT * FROM settings WHERE shop_id = $1', [req.shopId]);
  res.json(updated);
});

export default router;
