/**
 * Shopify Mandatory Webhooks (required for App Store approval):
 *   - customers/redact        : delete customer data
 *   - shop/redact             : delete all shop data (48h after uninstall)
 *   - customers/data_request  : export customer data (GDPR)
 *   - app/uninstalled         : clean up when merchant uninstalls
 */
import { Router } from 'express';
import { getDb } from '../database/init.js';
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

  const db = getDb();
  const shopRow = db.prepare('SELECT * FROM shops WHERE shop_domain = ?').get(shop);

  if (shopRow) {
    db.prepare(
      'UPDATE shops SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE shop_domain = ?'
    ).run(shop);

  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/customers/redact
 * GDPR: Delete customer's personal data from our systems.
 * We only store shop-level data (no customer PII), so we acknowledge.
 */
router.post('/customers/redact', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] customers/redact: ${shop}`);

  const db = getDb();
  db.prepare(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES (?, 'customers/redact', ?)"
  ).run(shop, JSON.stringify(req.body));

  // We do not store any customer PII — acknowledge immediately
  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/shop/redact
 * GDPR: Delete all shop data (sent 48h after uninstall).
 */
router.post('/shop/redact', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] shop/redact: ${shop}`);

  const db = getDb();

  // Log the request
  db.prepare(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES (?, 'shop/redact', ?)"
  ).run(shop, JSON.stringify(req.body));

  // Delete all shop data (cascades to countries, rates, rules, settings, subscriptions)
  const shopRow = db.prepare('SELECT id FROM shops WHERE shop_domain = ?').get(shop);
  if (shopRow) {
    db.prepare('DELETE FROM shops WHERE id = ?').run(shopRow.id);
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/customers/data_request
 * GDPR: Respond to customer data export request.
 * We store no customer PII — respond with empty data.
 */
router.post('/customers/data_request', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  console.log(`[Webhook] customers/data_request: ${shop}`);

  const db = getDb();
  db.prepare(
    "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES (?, 'customers/data_request', ?)"
  ).run(shop, JSON.stringify(req.body));

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/compliance
 * Single endpoint for all three GDPR compliance topics (configured via shopify.app.toml).
 * Shopify routes customers/data_request, customers/redact, and shop/redact here.
 */
router.post('/compliance', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  console.log(`[Webhook] compliance/${topic}: ${shop}`);

  const db = getDb();

  if (topic === 'shop/redact') {
    try {
      db.prepare(
        "INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES (?, 'shop/redact', ?)"
      ).run(shop, JSON.stringify(req.body));
      const shopRow = db.prepare('SELECT id FROM shops WHERE shop_domain = ?').get(shop);
      if (shopRow) {
        db.prepare('DELETE FROM shops WHERE id = ?').run(shopRow.id);
      }
    } catch (err) { console.error(`[Webhook] compliance/shop/redact error:`, err.message); }
  } else if (topic === 'customers/redact' || topic === 'customers/data_request') {
    try {
      db.prepare(
        'INSERT INTO gdpr_requests (shop_domain, topic, payload) VALUES (?, ?, ?)'
      ).run(shop, topic, JSON.stringify(req.body));
    } catch (err) { console.error(`[Webhook] compliance/${topic} error:`, err.message); }
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/webhooks/app_subscriptions/update
 * Billing status change — keep local subscription table in sync.
 */
router.post('/app_subscriptions/update', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  const { app_subscription } = req.body;

  if (app_subscription) {
    const db = getDb();
    const shopRow = db.prepare('SELECT id FROM shops WHERE shop_domain = ?').get(shop);
    if (shopRow) {
      const status = app_subscription.status?.toLowerCase();
      db.prepare(`
        UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE shop_id = ? AND shopify_charge_id LIKE ?
      `).run(status, shopRow.id, `%${app_subscription.id}%`);
    }
  }

  res.status(200).json({ ok: true });
});

export default router;
