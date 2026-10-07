import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';
import { createSubscription, getActiveSubscription, cancelSubscription, PLANS } from '../services/billing.js';
import { validateShopDomain } from '../middleware/hmac.js';

const router = Router();

/**
 * GET /api/billing/callback — Shopify redirects here after merchant approves/declines
 * Must be BEFORE requireShopAuth because this is a browser redirect with no Bearer token.
 */
router.get('/callback', async (req, res) => {
  const { shop, plan, charge_id } = req.query;
  if (!shop) return res.status(400).send('Missing shop');
  if (!validateShopDomain(shop)) return res.status(400).send('Invalid shop domain');

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1', [shop]);
  if (!shopRow) return res.status(404).send('Shop not found');

  try {
    const live = await getActiveSubscription(shop, shopRow.access_token);

    if (live && (live.status === 'ACTIVE' || live.status === 'PENDING')) {
      await dbRun(`
        INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id, current_period_end)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(shop_id) DO UPDATE SET
          plan = excluded.plan, status = excluded.status,
          shopify_charge_id = excluded.shopify_charge_id,
          current_period_end = excluded.current_period_end,
          updated_at = NOW()
      `, [
        shopRow.id,
        plan || (live.name.includes('Annual') ? 'annual' : 'monthly'),
        live.status.toLowerCase(),
        live.id,
        live.currentPeriodEnd,
      ]);
      return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?subscribed=1`);
    } else {
      await dbRun(
        "UPDATE subscriptions SET status = 'declined', updated_at = NOW() WHERE shop_id = $1",
        [shopRow.id]
      );
      return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?subscribed=0`);
    }
  } catch (err) {
    console.error('[Billing] callback error:', err.message);
    res.status(500).send('Billing error — please try again');
  }
});

// All remaining billing routes require authenticated shop session
router.use(requireShopAuth);

/**
 * GET /api/billing/plans — list available plans
 */
router.get('/plans', (req, res) => {
  const plans = Object.values(PLANS).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    interval: p.interval,
    trialDays: p.trialDays,
    currency: p.currencyCode,
  }));
  res.json(plans);
});

/**
 * GET /api/billing/subscription — get current subscription status
 */
router.get('/subscription', async (req, res) => {
  const local = await dbGet('SELECT * FROM subscriptions WHERE shop_id = $1', [req.shopId]);

  // Also check Shopify for live status
  try {
    const live = await getActiveSubscription(req.shopRow.shop_domain, req.shopRow.access_token);
    if (live) {
      // Sync to local db
      await dbRun(`
        INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id, current_period_end)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(shop_id) DO UPDATE SET
          status = excluded.status,
          shopify_charge_id = excluded.shopify_charge_id,
          current_period_end = excluded.current_period_end,
          updated_at = NOW()
      `, [
        req.shopId,
        live.name.includes('Annual') ? 'annual' : 'monthly',
        live.status.toLowerCase(),
        live.id,
        live.currentPeriodEnd,
      ]);
      const updatedLocal = await dbGet('SELECT * FROM subscriptions WHERE shop_id = $1', [req.shopId]);
      return res.json({ subscription: live, local: updatedLocal });
    }
  } catch (err) {
    console.warn('Could not fetch live subscription:', err.message);
  }

  res.json({ subscription: null, local: local || null });
});

/**
 * POST /api/billing/subscribe — initiate subscription checkout
 * Body: { plan: 'monthly' | 'annual' }
 */
router.post('/subscribe', async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Choose: monthly or annual' });

  const returnUrl = `${process.env.HOST}/api/billing/callback?shop=${req.shopRow.shop_domain}&plan=${plan}`;

  try {
    const result = await createSubscription(
      req.shopRow.shop_domain,
      req.shopRow.access_token,
      plan,
      returnUrl,
    );

    // Record pending subscription
    await dbRun(`
      INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id)
      VALUES ($1, $2, 'pending', $3)
      ON CONFLICT(shop_id) DO UPDATE SET
        plan = excluded.plan, status = 'pending',
        shopify_charge_id = excluded.shopify_charge_id,
        updated_at = NOW()
    `, [req.shopId, plan, result.subscriptionId]);

    res.json({ confirmationUrl: result.confirmationUrl });
  } catch (err) {
    console.error('[Billing] subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * DELETE /api/billing/subscription — cancel subscription
 */
router.delete('/subscription', async (req, res) => {
  const sub = await dbGet('SELECT * FROM subscriptions WHERE shop_id = $1', [req.shopId]);
  if (!sub?.shopify_charge_id) return res.status(404).json({ error: 'No active subscription' });

  try {
    await cancelSubscription(req.shopRow.shop_domain, req.shopRow.access_token, sub.shopify_charge_id);
    await dbRun(
      "UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE shop_id = $1",
      [req.shopId]
    );
    res.json({ cancelled: true });
  } catch (err) {
    console.error('[Billing] cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
