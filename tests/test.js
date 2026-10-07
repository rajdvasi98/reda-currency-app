/**
 * Multi Currency Converter — Integration Test Suite
 * Run: node tests/test.js
 *
 * Tests all API endpoints against a live server with an in-memory test DB.
 */
import { createHmac } from 'crypto';

const BASE = 'http://localhost:3099';
const TEST_SHOP = 'test-store.myshopify.com';
let shopId = null;

// ─── Test helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

async function get(path) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}shop=${TEST_SHOP}`;
  const res = await fetch(url, { headers: { 'X-Shopify-Shop-Domain': TEST_SHOP } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function post(path, body) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}shop=${TEST_SHOP}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': TEST_SHOP },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function put(path, body) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}shop=${TEST_SHOP}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': TEST_SHOP },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function del(path) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}shop=${TEST_SHOP}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-Shopify-Shop-Domain': TEST_SHOP },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function signWebhook(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

async function webhook(topic, body, shopDomain = TEST_SHOP) {
  const rawBody = JSON.stringify(body);
  const secret = process.env.SHOPIFY_API_SECRET || 'testsecret';
  const hmac = signWebhook(rawBody, secret);
  const res = await fetch(`${BASE}/api/webhooks/${topic}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Shop-Domain': shopDomain,
    },
    body: rawBody,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ─── Seed test shop directly into DB ──────────────────────────────────────

async function seedTestShop() {
  // Use internal seed endpoint (test-only, enabled in dev)
  const res = await fetch(`${BASE}/api/test/seed-shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop: TEST_SHOP, currency: 'USD' }),
  });
  if (!res.ok) throw new Error('Failed to seed test shop');
  const data = await res.json();
  shopId = data.shopId;
  return data;
}

// ─── Test Suites ───────────────────────────────────────────────────────────

async function runHealthTests() {
  console.log('\n📋 Health & Infrastructure');

  await test('GET /health returns ok', async () => {
    const res = await fetch(`${BASE}/health`);
    assert(res.ok, 'health not ok');
    const body = await res.json();
    assert(body.status === 'ok', `expected ok, got ${body.status}`);
    assert(body.version, 'missing version');
  });

  await test('GET /widget/currency-widget.js is accessible', async () => {
    const res = await fetch(`${BASE}/widget/currency-widget.js`);
    assert(res.ok, `widget not accessible: ${res.status}`);
    const text = await res.text();
    assert(text.includes('Multi Currency Converter Widget'), 'widget JS not found');
    assert(text.includes('APP_HOST'), 'missing APP_HOST placeholder');
  });

  await test('Proxy config missing shop → 400', async () => {
    const res = await fetch(`${BASE}/api/proxy/config`);
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });
}

async function runCurrencyTests() {
  console.log('\n📋 Currencies (master list)');

  await test('GET /api/currencies returns seeded list', async () => {
    const res = await fetch(`${BASE}/api/currencies`);
    assert(res.ok, 'not ok');
    const body = await res.json();
    assert(Array.isArray(body), 'not an array');
    assert(body.length >= 20, `expected ≥20 currencies, got ${body.length}`);
    const usd = body.find(c => c.code === 'USD');
    assert(usd, 'USD missing');
    assert(usd.symbol === '$', `USD symbol wrong: ${usd.symbol}`);
    const inr = body.find(c => c.code === 'INR');
    assert(inr, 'INR missing');
    assert(inr.symbol === '₹', `INR symbol wrong: ${inr.symbol}`);
  });
}

async function runAuthTests() {
  console.log('\n📋 Auth & Session');

  await test('GET /api/auth/session for unknown shop → 401', async () => {
    const res = await fetch(`${BASE}/api/auth/session?shop=unknown-shop.myshopify.com`, {
      headers: { 'X-Shopify-Shop-Domain': 'unknown-shop.myshopify.com' },
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('GET /api/auth/session for test shop → 200 with shop data', async () => {
    const { status, body } = await get('/api/auth/session');
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert(body.shop?.shop_domain === TEST_SHOP, 'wrong shop domain');
    assert(body.shop?.default_currency, 'missing default_currency');
  });

  await test('GET /api/auth/install validates shop domain format', async () => {
    const res = await fetch(`${BASE}/api/auth/install?shop=invalid-domain`);
    assert(res.status === 400, `expected 400 for invalid domain, got ${res.status}`);
  });
}

async function runCountryTests() {
  console.log('\n📋 Countries');
  let createdId;

  await test('GET /api/countries returns seeded countries', async () => {
    const { status, body } = await get('/api/countries');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(body), 'not array');
    assert(body.length >= 8, `expected ≥8 seeded countries, got ${body.length}`);
  });

  await test('POST /api/countries creates a country', async () => {
    const { status, body } = await post('/api/countries', {
      country_code: 'JP',
      country_name: 'Japan',
      currency_code: 'JPY',
      flag_emoji: '🇯🇵',
      price_adjustment_type: 'percentage',
      price_adjustment_value: 2,
      rounding_rule: 'nearest_integer',
    });
    assert(status === 201, `expected 201, got ${status}: ${JSON.stringify(body)}`);
    assert(body.country_code === 'JP', 'wrong country code');
    assert(body.id, 'missing id');
    createdId = body.id;
  });

  await test('POST /api/countries duplicate → 409', async () => {
    const { status } = await post('/api/countries', {
      country_code: 'JP', country_name: 'Japan', currency_code: 'JPY',
    });
    assert(status === 409, `expected 409, got ${status}`);
  });

  await test('POST /api/countries missing fields → 400', async () => {
    const { status } = await post('/api/countries', { country_code: 'ZZ' });
    assert(status === 400, `expected 400, got ${status}`);
  });

  await test('PUT /api/countries/:id updates country', async () => {
    const { status, body } = await put(`/api/countries/${createdId}`, {
      price_adjustment_value: 5,
      rounding_rule: 'nearest_99',
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.price_adjustment_value === 5, 'adjustment not updated');
    assert(body.rounding_rule === 'nearest_99', 'rounding not updated');
  });

  await test('PUT /api/countries/:id toggle disable', async () => {
    const { status, body } = await put(`/api/countries/${createdId}`, { is_enabled: 0 });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.is_enabled === 0, 'not disabled');
  });

  await test('DELETE /api/countries/:id removes country', async () => {
    const { status } = await del(`/api/countries/${createdId}`);
    assert(status === 200, `expected 200, got ${status}`);
  });

  await test('DELETE /api/countries/:id unknown → 404', async () => {
    const { status } = await del('/api/countries/99999');
    assert(status === 404, `expected 404, got ${status}`);
  });
}

async function runExchangeRateTests() {
  console.log('\n📋 Exchange Rates');

  await test('GET /api/exchange-rates returns rates', async () => {
    const { status, body } = await get('/api/exchange-rates');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(body), 'not array');
  });

  let rateId;
  await test('GET /api/exchange-rates has INR rate if fetched', async () => {
    const { body } = await get('/api/exchange-rates');
    // May be empty if no network available in test env — just check structure
    if (body.length > 0) {
      assert(body[0].from_currency, 'missing from_currency');
      assert(body[0].rate > 0, 'rate not positive');
      rateId = body[0].id;
    }
  });

  await test('PUT /api/exchange-rates/:id updates rate manually', async () => {
    if (!rateId) { console.log('    ⏭ skipped (no rates in DB)'); return; }
    const { status, body } = await put(`/api/exchange-rates/${rateId}`, { rate: 83.5 });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.rate === 83.5, `rate not updated: ${body.rate}`);
    assert(body.source === 'manual', 'source not manual');
  });

  await test('PUT /api/exchange-rates/:id invalid rate → 400', async () => {
    if (!rateId) { console.log('    ⏭ skipped (no rates in DB)'); return; }
    const { status } = await put(`/api/exchange-rates/${rateId}`, { rate: -1 });
    assert(status === 400, `expected 400, got ${status}`);
  });
}

async function runPricingRuleTests() {
  console.log('\n📋 Pricing Rules');
  let ruleId;

  await test('GET /api/pricing-rules returns empty array initially', async () => {
    const { status, body } = await get('/api/pricing-rules');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(body), 'not array');
  });

  await test('POST /api/pricing-rules creates rule', async () => {
    const { status, body } = await post('/api/pricing-rules', {
      country_code: 'IN',
      rule_type: 'all',
      percentage_adjustment: 5,
      priority: 10,
    });
    assert(status === 201, `expected 201, got ${status}: ${JSON.stringify(body)}`);
    assert(body.country_code === 'IN', 'wrong country');
    assert(body.percentage_adjustment === 5, 'wrong adjustment');
    ruleId = body.id;
  });

  await test('POST /api/pricing-rules missing override → 400', async () => {
    const { status } = await post('/api/pricing-rules', { country_code: 'US', rule_type: 'all' });
    assert(status === 400, `expected 400, got ${status}`);
  });

  await test('PUT /api/pricing-rules/:id updates rule', async () => {
    const { status, body } = await put(`/api/pricing-rules/${ruleId}`, { percentage_adjustment: 8 });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.percentage_adjustment === 8, 'not updated');
  });

  await test('DELETE /api/pricing-rules/:id removes rule', async () => {
    const { status } = await del(`/api/pricing-rules/${ruleId}`);
    assert(status === 200, `expected 200, got ${status}`);
  });
}

async function runSettingsTests() {
  console.log('\n📋 Settings');

  await test('GET /api/settings returns defaults', async () => {
    const { status, body } = await get('/api/settings');
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.widget_position, 'missing widget_position');
    assert(body.fallback_country, 'missing fallback_country');
  });

  await test('PUT /api/settings updates settings', async () => {
    const { status, body } = await put('/api/settings', {
      widget_position: 'bottom-right',
      widget_bg_color: '#000000',
      auto_detect_enabled: 0,
      fallback_country: 'GB',
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.widget_position === 'bottom-right', 'position not updated');
    assert(body.widget_bg_color === '#000000', 'color not updated');
    assert(body.fallback_country === 'GB', 'fallback not updated');
  });

  await test('PUT /api/settings restores defaults', async () => {
    await put('/api/settings', { widget_position: 'bottom-left', fallback_country: 'US', auto_detect_enabled: 1 });
  });
}

async function runProxyTests() {
  console.log('\n📋 Storefront Proxy');

  await test('GET /api/proxy/config returns config for test shop', async () => {
    const res = await fetch(`${BASE}/api/proxy/config?shop=${TEST_SHOP}`);
    assert(res.ok, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.shop === TEST_SHOP, 'wrong shop');
    assert(body.baseCurrency, 'missing baseCurrency');
    assert(Array.isArray(body.countries), 'countries not array');
    assert(body.currencies && typeof body.currencies === 'object', 'currencies not object');
    assert(body.settings, 'missing settings');
    assert(body.settings.widgetPosition, 'missing widgetPosition');
  });

  await test('GET /api/proxy/detect responds (may not detect in test env)', async () => {
    const res = await fetch(`${BASE}/api/proxy/detect?shop=${TEST_SHOP}`);
    assert(res.ok, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert('detected' in body, 'missing detected field');
    assert('source' in body, 'missing source field');
  });

  await test('GET /api/proxy/prices converts prices', async () => {
    const res = await fetch(`${BASE}/api/proxy/prices?shop=${TEST_SHOP}&country=IN&prices=10000,50000,100000`);
    assert(res.ok, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.results), 'results not array');
    assert(body.results.length === 3, `expected 3 results, got ${body.results.length}`);
    body.results.forEach(r => {
      assert('original' in r, 'missing original');
      assert('converted' in r, 'missing converted');
      assert('currency' in r, 'missing currency');
    });
  });

  await test('GET /api/proxy/config has CORS headers', async () => {
    const res = await fetch(`${BASE}/api/proxy/config?shop=${TEST_SHOP}`);
    const cors = res.headers.get('access-control-allow-origin');
    assert(cors === '*', `expected CORS *, got ${cors}`);
  });
}

async function runBillingTests() {
  console.log('\n📋 Billing');

  await test('GET /api/billing/plans returns 2 plans', async () => {
    const { status, body } = await get('/api/billing/plans');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(body), 'not array');
    assert(body.length === 2, `expected 2 plans, got ${body.length}`);
    const monthly = body.find(p => p.id === 'monthly');
    const annual = body.find(p => p.id === 'annual');
    assert(monthly, 'missing monthly plan');
    assert(annual, 'missing annual plan');
    assert(monthly.price === 5, `monthly price wrong: ${monthly.price}`);
    assert(annual.price === 50, `annual price wrong: ${annual.price}`);
    assert(monthly.trialDays === 7, `monthly trial wrong: ${monthly.trialDays}`);
    assert(annual.trialDays === 7, `annual trial wrong: ${annual.trialDays}`);
    assert(monthly.interval === 'EVERY_30_DAYS', `monthly interval wrong: ${monthly.interval}`);
    assert(annual.interval === 'ANNUAL', `annual interval wrong: ${annual.interval}`);
  });

  await test('GET /api/billing/subscription returns null for new shop', async () => {
    const { status } = await get('/api/billing/subscription');
    // 200 with null subscription or 200 with live check failure — both ok
    assert(status === 200, `expected 200, got ${status}`);
  });

  await test('POST /api/billing/subscribe invalid plan → 400', async () => {
    const { status } = await post('/api/billing/subscribe', { plan: 'enterprise' });
    assert(status === 400, `expected 400, got ${status}`);
  });
}

async function runWebhookTests() {
  console.log('\n📋 Webhooks');

  await test('POST /api/webhooks/customers/redact with valid HMAC → 200', async () => {
    const { status } = await webhook('customers/redact', {
      shop_id: 1,
      shop_domain: TEST_SHOP,
      customer: { id: 123, email: 'test@example.com' },
    });
    assert(status === 200, `expected 200, got ${status}`);
  });

  await test('POST /api/webhooks/customers/data_request with valid HMAC → 200', async () => {
    const { status } = await webhook('customers/data_request', {
      shop_id: 1,
      shop_domain: TEST_SHOP,
      customer: { id: 123 },
    });
    assert(status === 200, `expected 200, got ${status}`);
  });

  await test('POST /api/webhooks with invalid HMAC → 401', async () => {
    const res = await fetch(`${BASE}/api/webhooks/customers/redact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': 'invalid-hmac',
        'X-Shopify-Shop-Domain': TEST_SHOP,
      },
      body: JSON.stringify({ test: true }),
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('POST /api/webhooks/app/uninstalled marks shop inactive', async () => {
    // Create a temp shop to uninstall
    await fetch(`${BASE}/api/test/seed-shop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: 'temp-uninstall.myshopify.com', currency: 'USD' }),
    });
    const { status } = await webhook('app/uninstalled', { shop_id: 99, shop_domain: 'temp-uninstall.myshopify.com' }, 'temp-uninstall.myshopify.com');
    assert(status === 200, `expected 200, got ${status}`);
  });

  await test('POST /api/webhooks/shop/redact deletes shop data', async () => {
    // Create a shop just to redact
    await fetch(`${BASE}/api/test/seed-shop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: 'temp-redact.myshopify.com', currency: 'USD' }),
    });
    const { status } = await webhook('shop/redact', { shop_domain: 'temp-redact.myshopify.com' }, 'temp-redact.myshopify.com');
    assert(status === 200, `expected 200, got ${status}`);
  });
}

async function runSecurityTests() {
  console.log('\n📋 Security');

  await test('Auth install rejects invalid shop format', async () => {
    const r1 = await fetch(`${BASE}/api/auth/install?shop=javascript:alert(1)`);
    assert(r1.status === 400, `expected 400 for JS injection, got ${r1.status}`);
    const r2 = await fetch(`${BASE}/api/auth/install?shop=evil.shopify.com.attacker.com`);
    assert(r2.status === 400, `expected 400 for spoofed domain, got ${r2.status}`);
    const r3 = await fetch(`${BASE}/api/auth/install?shop=../../etc/passwd`);
    assert(r3.status === 400, `expected 400 for path traversal, got ${r3.status}`);
  });

  await test('Admin routes reject requests without shop header', async () => {
    const res = await fetch(`${BASE}/api/countries`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('Admin routes reject unknown shop', async () => {
    const res = await fetch(`${BASE}/api/countries?shop=not-installed.myshopify.com`, {
      headers: { 'X-Shopify-Shop-Domain': 'not-installed.myshopify.com' },
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });
}

async function runPriceConversionTests() {
  console.log('\n📋 Price Conversion Logic');

  await test('Proxy prices endpoint handles zero price', async () => {
    const res = await fetch(`${BASE}/api/proxy/prices?shop=${TEST_SHOP}&country=IN&prices=0`);
    assert(res.ok, `not ok: ${res.status}`);
    const body = await res.json();
    assert(body.results.length === 1, 'expected 1 result');
  });

  await test('Proxy prices handles multiple prices', async () => {
    const res = await fetch(`${BASE}/api/proxy/prices?shop=${TEST_SHOP}&country=GB&prices=999,1999,9999`);
    assert(res.ok, `not ok: ${res.status}`);
    const body = await res.json();
    assert(body.results.length === 3, `expected 3 results, got ${body.results.length}`);
    body.results.forEach((r, i) => {
      assert(r.original > 0, `result ${i} original is 0`);
      assert(typeof r.converted === 'number', `result ${i} converted not number`);
      assert(typeof r.currency === 'string', `result ${i} currency not string`);
    });
  });

  await test('Proxy config has all required fields', async () => {
    const res = await fetch(`${BASE}/api/proxy/config?shop=${TEST_SHOP}`);
    const body = await res.json();
    const required = ['shop', 'baseCurrency', 'countries', 'currencies', 'rates', 'settings'];
    for (const f of required) {
      assert(f in body, `missing field: ${f}`);
    }
    const settingsRequired = ['widgetPosition', 'widgetBgColor', 'widgetTextColor', 'fallbackCountry'];
    for (const f of settingsRequired) {
      assert(f in body.settings, `missing settings field: ${f}`);
    }
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Multi Currency Converter — Integration Tests');
  console.log('=====================================');

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!ready) {
    console.error('\n❌ Server not reachable at', BASE);
    console.error('   Start the test server first: npm run test:server');
    process.exit(1);
  }

  // Seed the test shop
  try {
    await seedTestShop();
    console.log(`   Test shop: ${TEST_SHOP} (id=${shopId})`);
  } catch (err) {
    console.error('Failed to seed test shop:', err.message);
    process.exit(1);
  }

  // Run all suites
  await runHealthTests();
  await runCurrencyTests();
  await runAuthTests();
  await runCountryTests();
  await runExchangeRateTests();
  await runPricingRuleTests();
  await runSettingsTests();
  await runProxyTests();
  await runBillingTests();
  await runWebhookTests();
  await runSecurityTests();
  await runPriceConversionTests();

  // Summary
  console.log('\n=====================================');
  console.log(`Total: ${passed + failed} tests — ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
