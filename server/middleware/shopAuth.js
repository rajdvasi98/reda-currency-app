import { dbGet } from '../database/init.js';

export async function requireShopAuth(req, res, next) {
  if (!req.shopAuthenticated || !req.shopDomain) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1 AND is_active = 1', [req.shopDomain]);

  if (!shopRow) {
    return res.status(401).json({ error: 'Shop not installed' });
  }

  req.shopRow = shopRow;
  req.shopId = shopRow.id;
  next();
}
