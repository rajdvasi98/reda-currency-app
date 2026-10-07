import { getDb } from '../database/init.js';

/**
 * Middleware: verify the requesting shop is installed and active.
 * Attaches req.shopRow and req.shopId for downstream route use.
 */
export function requireShopAuth(req, res, next) {
  const shop = req.query.shop || req.headers['x-shopify-shop-domain'] || req.body?.shop;

  if (!shop) {
    return res.status(401).json({ error: 'Missing shop domain' });
  }

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ? AND is_active = 1').get(shop);

  if (!shopRow) {
    return res.status(401).json({
      error: 'Shop not installed',
      installUrl: `/api/auth/install?shop=${shop}`,
    });
  }

  req.shopRow = shopRow;
  req.shopId = shopRow.id;
  next();
}
