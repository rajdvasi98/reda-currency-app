import { Router } from 'express';
import { getDb } from '../database/init.js';
import { requireShopAuth } from '../middleware/shopAuth.js';
import { createSubscription, getActiveSubscription, cancelSubscription, PLANS } from '../services/billing.js';

const router = Router();
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
  const db = getDb();
  const local = db.prepare('SELECT * FROM subscriptions WHERE shop_id = ?').get(req.shopId);

  // Also check Shopify for live status
  try {
    const live = await getActiveSubscription(req.shopRow.shop_domain, req.shopRow.access_token);
    if (live) {
      // Sync to local db
      db.prepare(`
        INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id, current_period_end)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(shop_id) DO UPDATE SET
          status = excluded.status,
          shopify_charge_id = excluded.shopify_charge_id,
          current_period_end = excluded.current_period_end,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        req.shopId,
        live.name.includes('Annual') ? 'annual' : 'monthly',
        live.status.toLowerCase(),
        live.id,
        live.currentPeriodEnd,
      );
      return res.json({ subscription: live, local: db.prepare('SELECT * FROM subscriptions WHERE shop_id = ?').get(req.shopId) });
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
    const db = getDb();
    db.prepare(`
      INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id)
      VALUES (?, ?, 'pending', ?)
      ON CONFLICT(shop_id) DO UPDATE SET
        plan = excluded.plan, status = 'pending',
        shopify_charge_id = excluded.shopify_charge_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(req.shopId, plan, result.subscriptionId);

    res.json({ confirmationUrl: result.confirmationUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/callback — Shopify redirects here after merchant approves/declines
 */
router.get('/callback', async (req, res) => {
  const { shop, plan, charge_id } = req.query;
  if (!shop) return res.status(400).send('Missing shop');

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ?').get(shop);
  if (!shopRow) return res.status(404).send('Shop not found');

  try {
    // Verify subscription is active with Shopify
    const live = await getActiveSubscription(shop, shopRow.access_token);

    if (live && (live.status === 'ACTIVE' || live.status === 'PENDING')) {
      db.prepare(`
        INSERT INTO subscriptions (shop_id, plan, status, shopify_charge_id, current_period_end)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(shop_id) DO UPDATE SET
          plan = excluded.plan, status = excluded.status,
          shopify_charge_id = excluded.shopify_charge_id,
          current_period_end = excluded.current_period_end,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        shopRow.id,
        plan || (live.name.includes('Annual') ? 'annual' : 'monthly'),
        live.status.toLowerCase(),
        live.id,
        live.currentPeriodEnd,
      );
      // Redirect back to admin app
      return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?subscribed=1`);
    } else {
      // Merchant declined
      db.prepare(
        "UPDATE subscriptions SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE shop_id = ?"
      ).run(shopRow.id);
      return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?subscribed=0`);
    }
  } catch (err) {
    console.error('Billing callback error:', err);
    res.status(500).send(`Billing error: ${err.message}`);
  }
});

/**
 * DELETE /api/billing/subscription — cancel subscription
 */
router.delete('/subscription', async (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subscriptions WHERE shop_id = ?').get(req.shopId);
  if (!sub?.shopify_charge_id) return res.status(404).json({ error: 'No active subscription' });

  try {
    await cancelSubscription(req.shopRow.shop_domain, req.shopRow.access_token, sub.shopify_charge_id);
    db.prepare(
      "UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE shop_id = ?"
    ).run(req.shopId);
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
