import { getDb } from '../database/init.js';

/**
 * Middleware: verify the requesting shop is installed and active.
 * Attaches req.shopRow and req.shopId for downstream route use.
 */
export function requireShopAuth(req, res, next) {
  if (!req.shopAuthenticated || !req.shopDomain) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ? AND is_active = 1').get(req.shopDomain);

  if (!shopRow) {
    return res.status(401).json({ error: 'Shop not installed' });
  }

  req.shopRow = shopRow;
  req.shopId = shopRow.id;
  next();
}
