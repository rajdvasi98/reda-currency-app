import { dbGet, dbRun } from '../database/init.js';

/**
 * Returns a valid access token for the shop, refreshing it if expired.
 * Falls back to the stored token if no refresh_token is available.
 */
export async function getValidToken(shopDomain) {
  const shop = await dbGet(
    'SELECT access_token, refresh_token, token_expires_at FROM shops WHERE shop_domain = $1 AND is_active = 1',
    [shopDomain]
  );

  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  if (!shop.token_expires_at) return shop.access_token;

  const expiresAt = new Date(shop.token_expires_at);
  const bufferMs = 5 * 60 * 1000;

  if (Date.now() < expiresAt.getTime() - bufferMs) {
    return shop.access_token;
  }

  if (!shop.refresh_token) {
    return shop.access_token;
  }

  return refreshTokenForShop(shopDomain, shop.refresh_token);
}

async function refreshTokenForShop(shopDomain, currentRefreshToken) {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: currentRefreshToken,
      subject_token_type: 'urn:shopify:params:oauth:token-type:offline-refresh-token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      expiring: '1',
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const data = await res.json();
  const { access_token, refresh_token: newRefreshToken, expires_in } = data;
  const tokenExpiresAt = expires_in
    ? new Date(Date.now() + expires_in * 1000).toISOString()
    : null;

  await dbRun(
    `UPDATE shops SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW()
     WHERE shop_domain = $4`,
    [access_token, newRefreshToken || currentRefreshToken, tokenExpiresAt, shopDomain]
  );

  return access_token;
}
