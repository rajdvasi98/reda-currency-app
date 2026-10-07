import crypto from 'crypto';

/**
 * Validate a Shopify session token (JWT signed with HMAC-SHA256 using the app secret).
 * Returns the decoded payload on success, null on failure.
 */
function verifySessionToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;

  try {
    const expected = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    // Check expiry
    if (claims.exp && Date.now() / 1000 > claims.exp) return null;

    return claims;
  } catch {
    return null;
  }
}

/**
 * Middleware: accept session tokens (Authorization: Bearer) OR shop-domain header.
 * Attaches req.shopDomain for downstream handlers.
 */
export function resolveShop(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const claims = verifySessionToken(token);
    if (claims && claims.dest) {
      try {
        req.shopDomain = new URL(claims.dest).hostname;
        req.shopAuthenticated = true;
      } catch {
        req.shopDomain = '';
        req.shopAuthenticated = false;
      }
      return next();
    }
  }
  req.shopDomain = req.query.shop || '';
  req.shopAuthenticated = false;
  next();
}
