# 💱 Multi Currency Converter — Shopify App

A Shopify App Store app that lets merchants sell in multiple currencies.

## Features

- **Country-based currency switching** — auto-detects visitor country by IP and shows prices in their local currency
- **Live exchange rates** — fetches from open.er-api.com with automatic fallback, refreshed on demand
- **Manual rate overrides** — merchants can pin specific exchange rates instead of using live data
- **Pricing rules** — per-country percentage adjustments, fixed adjustments, or full price overrides per product
- **Rounding rules** — nearest 0.99, 0.95, integer, 10, 50, 100
- **Embedded admin UI** — React SPA embedded in Shopify Admin via App Bridge
- **Storefront widget** — lightweight JS script tag injected into the theme
- **Billing** — Shopify App Subscription API with monthly ($5/mo) and annual ($50/yr) plans, 7-day trial
- **Full GDPR compliance** — customers/redact, shop/redact, customers/data_request webhooks

## Architecture

```
Multi Currency Converter
├── server/                  # Express.js backend (Node.js, ES modules)
│   ├── index.js             # App entry point, middleware setup
│   ├── database/
│   │   ├── schema.sql       # SQLite schema (shops, countries, rates, rules, …)
│   │   ├── init.js          # DB init + migrations
│   │   └── seeds.js         # Default countries & currencies
│   ├── middleware/
│   │   ├── hmac.js          # Shopify HMAC verification (OAuth + webhooks)
│   │   └── shopAuth.js      # Per-request shop authentication
│   ├── routes/
│   │   ├── auth.js          # OAuth install + callback, webhook registration
│   │   ├── webhooks.js      # Mandatory GDPR + billing webhooks
│   │   ├── countries.js     # Country CRUD
│   │   ├── currencies.js    # Currency list
│   │   ├── exchangeRates.js # Rate read/write
│   │   ├── pricingRules.js  # Pricing rule CRUD
│   │   ├── settings.js      # Widget settings
│   │   ├── proxy.js         # Public API for the storefront widget
│   │   ├── billing.js       # Subscription create/cancel
│   │   └── testHelpers.js   # Seed/cleanup routes (dev only)
│   └── services/
│       ├── exchangeRate.js  # Rate fetch + store (with fallback API)
│       ├── priceConverter.js# Price conversion + rounding + rule application
│       ├── geolocation.js   # IP → country (ip-api.com + ipapi.co fallback)
│       ├── billing.js       # Shopify App Subscription API helpers
│       └── tokenRefresh.js  # Refresh expiring offline access tokens
├── client/                  # React admin UI (Vite)
│   ├── App.jsx              # Main shell with sidebar navigation
│   ├── index.jsx            # React DOM root
│   ├── styles.css           # Global styles
│   ├── utils/api.js         # Fetch helpers for all backend endpoints
│   └── components/
│       ├── Dashboard.jsx    # Overview cards
│       ├── CountryList.jsx  # Enable/disable countries, set currency
│       ├── ExchangeRates.jsx# View and override exchange rates
│       ├── PricingRules.jsx # Create/edit pricing rules
│       ├── Settings.jsx     # Widget appearance settings
│       └── Billing.jsx      # Plan selection and subscription status
├── storefront/
│   └── currency-widget.js  # Injected into storefronts via script tag
└── public/                  # Static demo assets
```

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20+, Express 4, ES modules |
| Database | SQLite (better-sqlite3) |
| Frontend | React 19, Vite 5 |
| Auth | Shopify OAuth 2.0 with expiring offline tokens |
| Webhooks | HMAC-verified, raw body middleware |
| Tunnels (dev) | localtunnel / ngrok |

## Getting Started

### Prerequisites
- Node.js 20+
- A Shopify Partner account and a development app at [dev.shopify.com](https://dev.shopify.com)
- A public HTTPS URL (ngrok, localtunnel, or a deployed server)

### Installation

```bash
git clone https://github.com/vaynoxstudio/multi-currency-app.git
cd multi-currency-app
npm install
npm run build:client
```

### Configuration

Copy `.env.example` to `.env` and fill in:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products
HOST=https://your-tunnel-or-domain.com
PORT=3000
SQLITE_PATH=./database.sqlite
NODE_ENV=development
```

### Running locally

```bash
# Start the server
npm run dev

# In a separate terminal, start a tunnel
npx localtunnel --port 3000
# or: ngrok http 3000  (requires ngrok account)
```

Then update `HOST` in `.env` with the tunnel URL and restart the server.

### Installing on a dev store

```
https://{YOUR_TUNNEL}/api/auth/install?shop={YOUR_STORE}.myshopify.com
```

## Shopify App Requirements

This app implements all mandatory requirements for Shopify App Store listing:

| Requirement | Implementation |
|---|---|
| Expiring offline access tokens | `expiring=1` in OAuth token exchange |
| Token refresh | `server/services/tokenRefresh.js` |
| GDPR webhooks | `server/routes/webhooks.js` — customers/redact, shop/redact, customers/data_request |
| HMAC verification | `server/middleware/hmac.js` — `crypto.timingSafeEqual` |
| App uninstall webhook | `server/routes/webhooks.js` — app/uninstalled |
| Privacy policy | `/privacy` route in `server/index.js` |
| Billing | `server/services/billing.js` — App Subscription API |

## Environment Variables

| Variable | Description |
|---|---|
| `SHOPIFY_API_KEY` | App client ID from Partners Dashboard |
| `SHOPIFY_API_SECRET` | App client secret (used for HMAC) |
| `SCOPES` | OAuth permission scopes |
| `HOST` | Public HTTPS URL (tunnel or production domain) |
| `PORT` | Local server port (default 3000) |
| `SQLITE_PATH` | Path to SQLite database file |
| `NODE_ENV` | `development` or `production` |
| `EXCHANGE_RATE_API_URL` | Override exchange rate API base URL (optional) |
| `GEO_API_URL` | Override geolocation API URL (optional) |

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start server with `--watch` (auto-restart on changes) |
| `npm start` | Start server in production mode |
| `npm run build:client` | Build React admin UI |
| `npm run dev:client` | Vite dev server for admin UI |
| `npm run dev:all` | Server + Vite dev in parallel |
| `npm test` | Run test suite |

## License

MIT — © 2026 Vaynox Studio
