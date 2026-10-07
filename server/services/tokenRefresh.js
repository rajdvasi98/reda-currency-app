import { getDb } from '../database/init.js';

/**
 * Returns a valid access token for the shop, refreshing it if expired.
 * Falls back to the stored token if no refresh_token is available.
 */
export async function getValidToken(shopDomain) {
  const db = getDb();
  const shop = db.prepare(
    'SELECT access_token, refresh_token, token_expires_at FROM shops WHERE shop_domain = ? AND is_active = 1'
  ).get(shopDomain);

  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  // If no expiry info, return stored token as-is
  if (!shop.token_expires_at) return shop.access_token;

  const expiresAt = new Date(shop.token_expires_at);
  const bufferMs = 5 * 60 * 1000; // refresh 5 min before expiry

  if (Date.now() < expiresAt.getTime() - bufferMs) {
    return shop.access_token;
  }

  if (!shop.refresh_token) {
    return shop.access_token; // can't refresh; use what we have
  }

  return refreshToken(shopDomain, shop.refresh_token);
}

async function refreshToken(shopDomain, refreshToken) {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: refreshToken,
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

  const db = getDb();
  db.prepare(
    `UPDATE shops SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE shop_domain = ?`
  ).run(access_token, newRefreshToken || refreshToken, tokenExpiresAt, shopDomain);

  return access_token;
}
