/**
 * IP geolocation service.
 * Used by the proxy /detect endpoint to suggest a currency for anonymous storefront visitors.
 * Results are cached by /24 IP prefix for 24 hours to avoid hitting rate limits.
 * Primary: ip-api.com. Fallback: ipapi.co.
 */
const GEO_API = process.env.GEO_API_URL || 'http://ip-api.com/json';

// Cache: ip prefix -> { countryCode, country, ts }
const geoCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getIpPrefix(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') : ip;
}

export async function detectCountry(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { countryCode: null, country: null, source: 'local' };
  }

  const cacheKey = getIpPrefix(ip);
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { ...cached, source: 'cache' };
  }

  try {
    const res = await fetch(`${GEO_API}/${ip}?fields=countryCode,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'fail') {
      throw new Error(data.message || 'Geolocation failed');
    }

    const result = { countryCode: data.countryCode, country: data.country, ts: Date.now() };
    geoCache.set(cacheKey, result);
    return { ...result, source: 'api' };
  } catch (err) {
    console.warn('Geolocation failed for IP', ip, ':', err.message);

    // Fallback to ipapi.co
    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      if (data.country_code) {
        const result = { countryCode: data.country_code, country: data.country_name, ts: Date.now() };
        geoCache.set(cacheKey, result);
        return { ...result, source: 'fallback' };
      }
    } catch {
      // both failed
    }

    return { countryCode: null, country: null, source: 'error' };
  }
}

export function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}
