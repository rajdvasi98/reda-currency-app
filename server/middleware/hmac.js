import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Shopify webhook HMAC.
 * express.raw() gives req.body as a Buffer; we sign that, then parse it for handlers.
 */
export function verifyWebhookHmac(req, res, next) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader) return res.status(401).send('Missing webhook HMAC');

  // express.raw() sets req.body to a Buffer
  const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const rawString = rawBuffer.toString('utf8');

  const digest = createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBuffer)
    .digest('base64');

  let digestBuf, headerBuf;
  try {
    digestBuf = Buffer.from(digest, 'base64');
    headerBuf = Buffer.from(hmacHeader, 'base64');
  } catch {
    return res.status(401).send('Invalid HMAC format');
  }

  if (digestBuf.length !== headerBuf.length || !timingSafeEqual(digestBuf, headerBuf)) {
    return res.status(401).send('Webhook HMAC verification failed');
  }

  // Parse body for downstream route handlers
  try { req.body = JSON.parse(rawString || '{}'); } catch { req.body = {}; }
  req.rawBody = rawString;

  next();
}

/**
 * Validate that shop domain matches Shopify's format.
 */
export function validateShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}
