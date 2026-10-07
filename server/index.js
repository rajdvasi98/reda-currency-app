import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, getDb } from './database/init.js';
import authRoutes from './routes/auth.js';
import { resolveShop } from './middleware/sessionToken.js';
import countriesRoutes from './routes/countries.js';
import currenciesRoutes from './routes/currencies.js';
import exchangeRatesRoutes from './routes/exchangeRates.js';
import pricingRulesRoutes from './routes/pricingRules.js';
import settingsRoutes from './routes/settings.js';
import proxyRoutes from './routes/proxy.js';
import billingRoutes from './routes/billing.js';
import webhookRoutes from './routes/webhooks.js';
import testHelpersRoutes from './routes/testHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || `http://localhost:${PORT}`;

// Initialize database
const dbPath = process.env.SQLITE_PATH || './database.sqlite';
initDb(dbPath);

const app = express();
app.set('trust proxy', true);

// Webhook routes get raw body (Buffer) for HMAC verification; all others get JSON.
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = origin.endsWith('.myshopify.com')
      || origin.endsWith('.shopify.com')
      || origin === HOST
      || origin === `http://localhost:${PORT}`;
    cb(null, allowed);
  },
  credentials: true,
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});

// Serve public demo assets (publicly accessible — no auth)
app.use('/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  next();
}, express.static(join(__dirname, '../public')));

// Serve storefront widget (publicly accessible — CDN-style)
app.use('/widget', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
}, express.static(join(__dirname, '../storefront')));

// Serve built admin UI
app.use('/admin', express.static(join(__dirname, '../dist/client')));

// Webhooks (raw body needed — registered before JSON middleware)
app.use('/api/webhooks', webhookRoutes);

// Resolve shop identity from session token or headers for all API routes
app.use('/api', resolveShop);

// API routes (all JSON)
app.use('/api/auth', authRoutes);
app.use('/api/countries', countriesRoutes);
app.use('/api/currencies', currenciesRoutes);
app.use('/api/exchange-rates', exchangeRatesRoutes);
app.use('/api/pricing-rules', pricingRulesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/billing', billingRoutes);

// Test helpers — only in dev/test environments
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', testHelpersRoutes);
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

// Privacy policy (publicly accessible — required for Shopify App Store)
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Multi Currency Converter</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #1a1a2e; line-height: 1.7; }
    h1 { color: #6c63ff; border-bottom: 2px solid #6c63ff; padding-bottom: 12px; }
    h2 { color: #444; margin-top: 32px; }
    p, li { color: #555; }
    ul { padding-left: 24px; }
    .updated { color: #888; font-size: 14px; }
    a { color: #6c63ff; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="updated"><strong>App:</strong> Multi Currency Converter &nbsp;|&nbsp; <strong>Last updated:</strong> October 2026</p>

  <h2>1. Information We Collect</h2>
  <ul>
    <li>Shop domain and Shopify access token (required to operate the app)</li>
    <li>Merchant-configured country and currency settings</li>
    <li>We do <strong>not</strong> collect, store, or process any end-customer personal data</li>
  </ul>

  <h2>2. How We Use Information</h2>
  <p>The shop domain and access token are used solely to:</p>
  <ul>
    <li>Authenticate API requests to Shopify on your behalf</li>
    <li>Store your app configuration (countries, currencies, pricing rules)</li>
    <li>Display currency conversion on your storefront</li>
  </ul>

  <h2>3. Data Sharing</h2>
  <p>We do not sell, rent, or share your data with any third parties.</p>
  <p>The app uses two external public APIs:</p>
  <ul>
    <li><a href="https://open.er-api.com" target="_blank">open.er-api.com</a> — exchange rate data (no personal data sent)</li>
    <li><a href="https://ip-api.com" target="_blank">ip-api.com</a> — IP-based country detection (visitor IP, no storage)</li>
  </ul>

  <h2>4. Data Retention</h2>
  <p>All shop data (access token, configuration) is permanently deleted within 48 hours of app uninstallation, in response to Shopify's <code>shop/redact</code> webhook.</p>

  <h2>5. GDPR Compliance</h2>
  <p>We comply with all GDPR requirements. Our app implements all mandatory Shopify GDPR webhooks:</p>
  <ul>
    <li><strong>customers/data_request</strong> — we confirm we hold no customer personal data</li>
    <li><strong>customers/redact</strong> — acknowledged (no customer data stored)</li>
    <li><strong>shop/redact</strong> — all shop data deleted within 48 hours</li>
  </ul>

  <h2>6. Security</h2>
  <p>All data is transmitted over HTTPS. Access tokens are stored securely in an SQLite database on the server. We use HMAC verification for all Shopify webhooks.</p>

  <h2>7. Contact</h2>
  <p>For privacy-related questions or data deletion requests, contact us at:<br>
  <a href="mailto:vaynoxstudio@gmail.com">vaynoxstudio@gmail.com</a></p>
</body>
</html>`);
});

// SPA fallback for embedded admin
const adminFallback = (req, res) => {
  const indexPath = join(__dirname, '../dist/client/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(200).send('<p>Run <code>npm run build:client</code> to build the admin UI.</p>');
  });
};
app.get('/admin', adminFallback);

// Embedded app entry point — redirect to OAuth if shop is not installed
app.get('/app*', (req, res) => {
  const shop = req.query.shop;
  if (shop) {
    try {
      const db = getDb();
      const shopRow = db.prepare('SELECT is_active FROM shops WHERE shop_domain = ?').get(shop);
      if (!shopRow || !shopRow.is_active) {
        return res.redirect(`/api/auth/install?shop=${encodeURIComponent(shop)}`);
      }
    } catch {}
  }
  adminFallback(req, res);
});

// Root install redirect
app.get('/', (req, res) => {
  const shop = req.query.shop;
  if (shop) return res.redirect(`/api/auth/install?shop=${encodeURIComponent(shop)}`);
  res.send(`
    <html>
      <head><title>Multi Currency Converter</title></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center;background:#0f1117;color:#e8eaf0">
        <h1 style="color:#6c63ff">💱 Multi Currency Converter</h1>
        <p>Multi-currency pricing for Shopify stores.</p>
        <p style="color:#9aa0b4">Install from your Shopify Admin or via the Partner Dashboard.</p>
        <p><code style="color:#6c63ff">${HOST}</code></p>
      </body>
    </html>
  `);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', req.method, req.path, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Multi Currency Converter v1.0.0`);
  console.log(`   Port:   ${PORT}`);
  console.log(`   Public: ${HOST}`);
  console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`);
});
