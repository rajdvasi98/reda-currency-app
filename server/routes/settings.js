import { Router } from 'express';
import { getDb } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';

const router = Router();
router.use(requireShopAuth);

// GET /api/settings
router.get('/', (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings WHERE shop_id = ?').get(req.shopId);
  res.json(settings || {});
});

// PUT /api/settings
router.put('/', (req, res) => {
  const {
    auto_detect_enabled, widget_position,
    widget_bg_color, widget_text_color, widget_accent_color,
    auto_update_rates, rate_update_interval,
    fallback_country, show_flags, show_country_name,
  } = req.body;

  const db = getDb();
  db.prepare(`
    INSERT INTO settings (shop_id, auto_detect_enabled, widget_position, widget_bg_color, widget_text_color, widget_accent_color, auto_update_rates, rate_update_interval, fallback_country, show_flags, show_country_name)
    VALUES (@shop_id, @auto_detect_enabled, @widget_position, @widget_bg_color, @widget_text_color, @widget_accent_color, @auto_update_rates, @rate_update_interval, @fallback_country, @show_flags, @show_country_name)
    ON CONFLICT(shop_id) DO UPDATE SET
      auto_detect_enabled = COALESCE(@auto_detect_enabled, auto_detect_enabled),
      widget_position = COALESCE(@widget_position, widget_position),
      widget_bg_color = COALESCE(@widget_bg_color, widget_bg_color),
      widget_text_color = COALESCE(@widget_text_color, widget_text_color),
      widget_accent_color = COALESCE(@widget_accent_color, widget_accent_color),
      auto_update_rates = COALESCE(@auto_update_rates, auto_update_rates),
      rate_update_interval = COALESCE(@rate_update_interval, rate_update_interval),
      fallback_country = COALESCE(@fallback_country, fallback_country),
      show_flags = COALESCE(@show_flags, show_flags),
      show_country_name = COALESCE(@show_country_name, show_country_name),
      updated_at = CURRENT_TIMESTAMP
  `).run({
    shop_id: req.shopId,
    auto_detect_enabled, widget_position,
    widget_bg_color, widget_text_color, widget_accent_color,
    auto_update_rates, rate_update_interval,
    fallback_country, show_flags, show_country_name,
  });

  const updated = db.prepare('SELECT * FROM settings WHERE shop_id = ?').get(req.shopId);
  res.json(updated);
});

export default router;
