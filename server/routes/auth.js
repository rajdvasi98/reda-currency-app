import { Router } from 'express';
import { dbGet, dbRun } from '../database/init.js';
import { fetchAndStoreRates } from '../services/exchangeRate.js';
import { shopifyGraphQL, syncSubscription } from '../services/billing.js';
import { exchangeSessionToken, getValidToken, tokenExpiry } from '../services/tokenRefresh.js';
import { defaultCountries } from '../database/seeds.js';

const router = Router();

/**
 * GET /api/auth/session
 * Called by the admin UI on every load with an App Bridge session token. Installation is
 * managed by Shopify, so a shop we haven't seen yet is set up here via token exchange.
 */
router.get('/session', async (req, res) => {
  if (!req.shopAuthenticated) {
    return res.status(401).json({ error: 'Your session has expired. Open the app again from your Shopify admin.' });
  }
  const shop = req.shopDomain;

  const selectShop = () => dbGet(
    'SELECT id, shop_domain, default_currency, is_active FROM shops WHERE shop_domain = $1',
    [shop]
  );
  let shopRow = await selectShop();

  try {
    if (!shopRow || !shopRow.is_active) {
      await setupShop(shop, await exchangeSessionToken(shop, req.sessionToken));
      shopRow = await selectShop();
    }
    let subscription;
    try {
      subscription = await syncSubscription(shopRow.id, shop, await getValidToken(shop, req.sessionToken));
    } catch (err) {
      // A revoked token (e.g. a missed uninstall webhook before reinstall) gets a 401; re-exchange once.
      if (!/\b401\b/.test(err.message)) throw err;
      await setupShop(shop, await exchangeSessionToken(shop, req.sessionToken));
      subscription = await syncSubscription(shopRow.id, shop, await getValidToken(shop, req.sessionToken));
    }
    res.json({
      shop: { shop_domain: shopRow.shop_domain, default_currency: shopRow.default_currency },
      subscription,
    });
  } catch (err) {
    console.error('[Auth] Session setup failed:', err.message);
    res.status(500).json({ error: 'Could not finish loading the app. Please reload the page.' });
  }
});

async function setupShop(shop, tokenData) {
  const { access_token, refresh_token, expires_in } = tokenData;

  const data = await shopifyGraphQL(shop, access_token, '{ shop { currencyCode } }', {});
  const defaultCurrency = data?.shop?.currencyCode || 'USD';

  await dbRun(`
    INSERT INTO shops (shop_domain, access_token, refresh_token, token_expires_at, default_currency, is_active)
    VALUES ($1, $2, $3, $4, $5, 1)
    ON CONFLICT(shop_domain) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      default_currency = excluded.default_currency,
      installed_at = CASE WHEN shops.is_active = 1 THEN shops.installed_at ELSE NOW() END,
      is_active = 1, updated_at = NOW()
  `, [shop, access_token, refresh_token || null, tokenExpiry(expires_in), defaultCurrency]);

  const { id: shopId } = await dbGet('SELECT id FROM shops WHERE shop_domain = $1', [shop]);

  await dbRun('INSERT INTO settings (shop_id) VALUES ($1) ON CONFLICT DO NOTHING', [shopId]);

  for (const c of defaultCountries) {
    await dbRun(`
      INSERT INTO countries (shop_id, country_code, country_name, currency_code, flag_emoji)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [shopId, c.country_code, c.country_name, c.currency_code, c.flag_emoji]);
  }

  const rates = await fetchAndStoreRates(shopId, defaultCurrency);
  if (!rates.success) console.warn('[Auth] Initial rate fetch failed:', rates.error);
}

export default router;
