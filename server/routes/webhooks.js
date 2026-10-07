/**
 * Shopify Mandatory Webhooks (required for App Store approval):
 *   - customers/redact        : delete customer data
 *   - shop/redact             : delete all shop data (48h after uninstall)
 *   - customers/data_request  : export customer data (GDPR)
 *   - app/uninstalled         : clean up when merchant uninstalls
 */
import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { verifyWebhookHmac } from '../middleware/hmac.js';

const router = Router();

// All webhook routes verify HMAC before processing
router.use(verifyWebhookHmac);

/**
 * POST /api/webhooks/app/uninstalled
 * Mark shop as inactive.
 */
router.post('/app/uninstalled', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] app/uninstalled: ${shop}`);

  const shopRow = await dbGet('SELECT * FROM shops WHERE shop_domain = $1', [shop]);

  if (shopRow) {
    await dbRun(
      'UPDATE shops SET is_active = 0, updated_at = NOW() WHERE shop_domain = $1',
      [shop]
    );

  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/customers/redact
 * GDPR: Delete customer's personal data from our systems.
 * We only store shop-level data (no customer PII), so we acknowledge.
 */
router.post('/customers/redact', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] customers/redact: ${shop}`);

  await dbRun(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES ($1, 'customers/redact', $2)",
    [shop, JSON.stringify(req.body)]
  );

  // We do not store any customer PII — acknowledge immediately
  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/shop/redact
 * GDPR: Delete all shop data (sent 48h after uninstall).
 */
router.post('/shop/redact', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] shop/redact: ${shop}`);

  // Log the request
  await dbRun(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES ($1, 'shop/redact', $2)",
    [shop, JSON.stringify(req.body)]
  );

  // Delete all shop data (cascades to countries, rates, rules, settings, subscriptions)
  const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
  if (shopRow) {
    await dbRun('DELETE FROM shops WHERE id = $1', [shopRow.id]);
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/customers/data_request
 * GDPR: Respond to customer data export request.
 * We store no customer PII — respond with empty data.
 */
router.post('/customers/data_request', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] customers/data_request: ${shop}`);

  await dbRun(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES ($1, 'customers/data_request', $2)",
    [shop, JSON.stringify(req.body)]
  );

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/compliance
 * Single endpoint for all three GDPR compliance topics (configured via shopify.app.toml).
 * Shopify routes customers/data_request, customers/redact, and shop/redact here.
 */
router.post('/compliance', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  console.log(`[Webhook] compliance/${topic}: ${shop}`);

  if (topic === 'shop/redact') {
    try {
      await dbRun(
        "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES ($1, 'shop/redact', $2)",
        [shop, JSON.stringify(req.body)]
      );
      const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
      if (shopRow) {
        await dbRun('DELETE FROM shops WHERE id = $1', [shopRow.id]);
      }
    } catch (err) { console.error(`[Webhook] compliance/shop/redact error:`, err.message); }
  } else if (topic === 'customers/redact' || topic === 'customers/data_request') {
    try {
      await dbRun(
        'INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES ($1, $2, $3)',
        [shop, topic, JSON.stringify(req.body)]
      );
    } catch (err) { console.error(`[Webhook] compliance/${topic} error:`, err.message); }
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/app_subscriptions/update
 * Billing status change — keep local subscription table in sync.
 */
router.post('/app_subscriptions/update', async (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  const { app_subscription } = req.body;

  if (app_subscription) {
    const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
    if (shopRow) {
      const status = app_subscription.status?.toLowerCase();
      await dbRun(`
        UPDATE subscriptions SET status = $1, updated_at = NOW()
        WHERE shop_id = $2 AND shopify_charge_id LIKE $3
      `, [status, shopRow.id, `%${app_subscription.id}%`]);
    }
  }

  res.status(200).json({ ok: true });
});

export default router;
