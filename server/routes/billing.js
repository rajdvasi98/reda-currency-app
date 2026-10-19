import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';
import { createSubscription, cancelSubscription, syncSubscription, PLANS } from '../services/billing.js';
import { getValidToken } from '../services/tokenRefresh.js';
import { validateShopDomain } from '../middleware/hmac.js';

const router = Router();

/**
 * GET /api/billing/callback — Shopify redirects here after merchant approves/declines.
 * No session token on this browser redirect, so the result is read back from Shopify.
 */
router.get('/callback', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Missing shop');
  if (!validateShopDomain(shop)) return res.status(400).send('Invalid shop domain');

  const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1 AND is_active = 1', [shop]);
  if (!shopRow) return res.status(404).send('Shop not found');

  const appUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
  try {
    const sub = await syncSubscription(shopRow.id, shop, await getValidToken(shop));
    return res.redirect(`${appUrl}?subscribed=${sub ? 1 : 0}`);
  } catch (err) {
    console.error('[Billing] callback error:', err.message);
    return res.redirect(`${appUrl}?subscribed=0`);
  }
});

router.use(requireShopAuth);

router.get('/plans', (req, res) => {
  res.json(Object.values(PLANS).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    interval: p.interval,
    trialDays: p.trialDays,
    currency: p.currencyCode,
  })));
});

router.get('/subscription', async (req, res) => {
  try {
    const subscription = await syncSubscription(req.shopId, req.shopRow.shop_domain, req.shopRow.access_token);
    res.json({ subscription });
  } catch (err) {
    console.error('[Billing] subscription sync error:', err.message);
    res.status(502).json({ error: 'Could not load subscription from Shopify' });
  }
});

/**
 * POST /api/billing/subscribe — Body: { plan: 'monthly' | 'annual' }
 */
router.post('/subscribe', async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose: monthly or annual' });

  const returnUrl = `${process.env.HOST}/api/billing/callback?shop=${encodeURIComponent(req.shopRow.shop_domain)}`;

  try {
    const result = await createSubscription(req.shopRow.shop_domain, req.shopRow.access_token, plan, returnUrl);
    res.json({ confirmationUrl: result.confirmationUrl });
  } catch (err) {
    console.error('[Billing] subscribe error:', err.message);
    res.status(500).json({ error: 'Could not start the subscription. Please try again.' });
  }
});

router.delete('/subscription', async (req, res) => {
  const sub = await dbGet('SELECT * FROM subscriptions WHERE shop_id = $1', [req.shopId]);
  if (!sub?.shopify_charge_id) return res.status(404).json({ error: 'No active subscription' });

  try {
    await cancelSubscription(req.shopRow.shop_domain, req.shopRow.access_token, sub.shopify_charge_id);
    await dbRun('DELETE FROM subscriptions WHERE shop_id = $1', [req.shopId]);
    res.json({ cancelled: true });
  } catch (err) {
    console.error('[Billing] cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
