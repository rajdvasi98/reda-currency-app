import { dbGet } from '../database/init.js';
import { getValidToken } from '../services/tokenRefresh.js';

export async function requireShopAuth(req, res, next) {
  if (!req.shopAuthenticated || !req.shopDomain) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1 AND is_active = 1', [req.shopDomain]);

  if (!shopRow) {
    return res.status(401).json({ error: 'Shop not installed' });
  }

  try {
    shopRow.access_token = await getValidToken(req.shopDomain, req.sessionToken);
  } catch (err) {
    console.error('[Auth] Could not get access token:', err.message);
    return res.status(401).json({ error: 'Session expired. Please reload the app.' });
  }

  req.shopRow = shopRow;
  req.shopId = shopRow.id;
  next();
}

export async function requireActivePlan(req, res, next) {
  const sub = await dbGet('SELECT status FROM subscriptions WHERE shop_id = $1', [req.shopId]);
  if (sub?.status !== 'active') {
    return res.status(402).json({ error: 'Choose a plan to use Multi Currency Converter.', code: 'PLAN_REQUIRED' });
  }
  next();
}
