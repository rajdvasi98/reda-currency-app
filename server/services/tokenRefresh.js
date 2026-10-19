import { dbGet, dbRun } from '../database/init.js';

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function requestToken(shopDomain, params) {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      expiring: '1',
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function exchangeSessionToken(shopDomain, sessionToken) {
  return requestToken(shopDomain, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  });
}

function refreshAccessToken(shopDomain, refreshToken) {
  return requestToken(shopDomain, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: refreshToken,
    subject_token_type: 'urn:shopify:params:oauth:token-type:offline-refresh-token',
  });
}

export function tokenExpiry(expiresIn) {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

async function storeTokens(shopDomain, { access_token, refresh_token, expires_in }, previousRefreshToken) {
  await dbRun(
    `UPDATE shops SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW()
     WHERE shop_domain = $4`,
    [access_token, refresh_token || previousRefreshToken || null, tokenExpiry(expires_in), shopDomain]
  );
  return access_token;
}

function isFresh(tokenExpiresAt) {
  if (!tokenExpiresAt) return true;
  const raw = tokenExpiresAt instanceof Date ? tokenExpiresAt.toISOString() : String(tokenExpiresAt);
  const expiresAt = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  return Date.now() < expiresAt.getTime() - EXPIRY_BUFFER_MS;
}

/**
 * Returns a usable offline access token for the shop. Expired tokens are renewed with
 * the session token when the request has one (token exchange), else with the refresh token.
 */
export async function getValidToken(shopDomain, sessionToken = null) {
  const shop = await dbGet(
    'SELECT access_token, refresh_token, token_expires_at FROM shops WHERE shop_domain = $1 AND is_active = 1',
    [shopDomain]
  );
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);
  if (isFresh(shop.token_expires_at)) return shop.access_token;

  if (sessionToken) {
    try {
      return await storeTokens(shopDomain, await exchangeSessionToken(shopDomain, sessionToken), shop.refresh_token);
    } catch (err) {
      if (!shop.refresh_token) throw err;
      console.warn('[Token] Session token exchange failed, trying refresh token:', err.message);
    }
  }
  if (!shop.refresh_token) throw new Error(`Access token expired and no refresh token for ${shopDomain}`);
  return storeTokens(shopDomain, await refreshAccessToken(shopDomain, shop.refresh_token), shop.refresh_token);
}
