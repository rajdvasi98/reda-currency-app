import { Router } from 'express';
import { dbGet, dbRun, dbAll, getPool } from '../database/init.js';
import { fetchAndStoreRates } from '../services/exchangeRate.js';
import { defaultCountries } from '../database/seeds.js';
import { verifyOAuthHmac, validateShopDomain } from '../middleware/hmac.js';

const router = Router();

/**
 * GET /api/auth/install?shop=
 * Entry point: redirect merchant to Shopify OAuth consent screen.
 */
router.get('/install', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');
  if (!validateShopDomain(shop)) return res.status(400).send('Invalid shop domain');

  const nonce = crypto.randomUUID();
  // Use signed cookie for CSRF state validation
  res.cookie('shopify_oauth_state', nonce, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300000 });

  const redirectUri = encodeURIComponent(`${process.env.HOST}/api/auth/callback`);
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${process.env.SCOPES}&redirect_uri=${redirectUri}&state=${nonce}`;
  res.redirect(installUrl);
});

/**
 * GET /api/auth/callback
 * Shopify redirects here with code. Verify HMAC, exchange for token, set up shop.
 */
router.get('/callback', verifyOAuthHmac, async (req, res) => {
  const { shop, code, state } = req.query;

  if (!shop || !code) return res.status(400).send('Missing required parameters');
  if (!validateShopDomain(shop)) return res.status(400).send('Invalid shop domain');

  const savedState = req.cookies?.shopify_oauth_state;
  if (!savedState || savedState !== state) {
    return res.status(403).send('State mismatch — possible CSRF');
  }

  try {
    // Exchange code for expiring offline access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
        expiring: '1',
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokenData;
    const tokenExpiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    // Fetch shop info (currency, etc.)
    const shopInfoRes = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { 'X-Shopify-Access-Token': access_token },
    });
    const shopData = await shopInfoRes.json();
    const defaultCurrency = shopData?.shop?.currency || 'USD';

    // Upsert shop
    await dbRun(`
      INSERT INTO shops (shop_domain, access_token, refresh_token, token_expires_at, default_currency, is_active)
      VALUES ($1, $2, $3, $4, $5, 1)
      ON CONFLICT(shop_domain) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        default_currency = excluded.default_currency,
        is_active = 1, updated_at = NOW()
    `, [shop, access_token, refresh_token || null, tokenExpiresAt, defaultCurrency]);

    const shopRow = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);
    const shopId = shopRow.id;

    // Default settings
    await dbRun('INSERT INTO settings (shop_id) VALUES ($1) ON CONFLICT DO NOTHING', [shopId]);

    // Seed default countries
    for (const c of defaultCountries) {
      await dbRun(`
        INSERT INTO countries (shop_id, country_code, country_name, currency_code, flag_emoji)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [shopId, c.country_code, c.country_name, c.currency_code, c.flag_emoji]);
    }

    // Register mandatory GDPR + billing webhooks
    await registerWebhooks(shop, access_token);

    // Fetch initial exchange rates
    await fetchAndStoreRates(shopId, defaultCurrency);

    // Clear CSRF cookie
    res.clearCookie('shopify_oauth_state');

    // Redirect to embedded app
    res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`);
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    res.status(500).send('Installation failed — please try again');
  }
});

/**
 * GET /api/auth/session?shop=
 * Check if shop is installed (used by admin UI on load).
 */
router.get('/session', async (req, res) => {
  const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
  if (!shop) return res.status(400).json({ error: 'Missing shop' });
  if (!validateShopDomain(shop)) return res.status(400).json({ error: 'Invalid shop domain' });

  const shopRow = await dbGet(
    'SELECT id, shop_domain, default_currency, is_active FROM shops WHERE shop_domain = $1',
    [shop]
  );

  if (!shopRow || !shopRow.is_active) {
    return res.status(401).json({ error: 'Shop not installed', installUrl: `/api/auth/install?shop=${shop}` });
  }

  // Include subscription status
  const sub = await dbGet('SELECT plan, status, trial_ends_at, current_period_end FROM subscriptions WHERE shop_id = $1', [shopRow.id]);

  res.json({ shop: shopRow, subscription: sub || null });
});

/**
 * Register all mandatory Shopify webhooks for this shop.
 */
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'APP_UNINSTALLED', callbackUrl: `${process.env.HOST}/api/webhooks/app/uninstalled` },
    { topic: 'CUSTOMERS_REDACT', callbackUrl: `${process.env.HOST}/api/webhooks/customers/redact` },
    { topic: 'SHOP_REDACT', callbackUrl: `${process.env.HOST}/api/webhooks/shop/redact` },
    { topic: 'CUSTOMERS_DATA_REQUEST', callbackUrl: `${process.env.HOST}/api/webhooks/customers/data_request` },
    { topic: 'APP_SUBSCRIPTIONS_UPDATE', callbackUrl: `${process.env.HOST}/api/webhooks/app_subscriptions/update` },
  ];

  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id topic }
        userErrors { field message }
      }
    }
  `;

  for (const wh of webhooks) {
    try {
      const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({
          query: mutation,
          variables: {
            topic: wh.topic,
            webhookSubscription: { callbackUrl: wh.callbackUrl, format: 'JSON' },
          },
        }),
      });
      const data = await res.json();
      const errors = data?.data?.webhookSubscriptionCreate?.userErrors;
      if (errors?.length > 0) {
        // "already registered" is not a fatal error
        if (!errors[0].message.includes('already')) {
          console.warn(`Webhook ${wh.topic} error:`, errors);
        }
      }
    } catch (err) {
      console.warn(`Failed to register webhook ${wh.topic}:`, err.message);
    }
  }
}

export default router;
