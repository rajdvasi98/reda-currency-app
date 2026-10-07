# Multi Currency Converter — Setup & Deployment Guide

## What you need
- Shopify Partner account at https://partners.shopify.com
- Your Shopify credentials (API key + secret) from the Dev Dashboard

---

## Step 1 — Get your public URL (run first)

Open a terminal in the project folder and run:

```bash
npm run tunnel
```

This prints your public URL, for example:
```
PUBLIC URL:  https://multi-currency-converter.loca.lt
✅ .env updated automatically — HOST set to https://multi-currency-converter.loca.lt
```

Keep this terminal open — the tunnel must stay running while you use the app.

> The subdomain `multi-currency-converter` is requested each time.
> If it's taken, the tunnel will assign a random URL — copy whatever it prints.

---

## Step 2 — Create the app in Shopify Dev Dashboard

1. Go to https://dev.shopify.com/dashboard
2. Click **Create app**
3. Fill in:
   - **App name:** `Multi Currency Converter`
   - **App URL:** `https://multi-currency-converter.loca.lt` ← from Step 1
   - **Allowed redirection URL(s):** `https://multi-currency-converter.loca.lt/api/auth/callback`
4. Click **Save**
5. Copy your **Client ID** and **Client secret**

---

## Step 3 — Fill in .env

Open `.env` in the project root and fill in:

```
SHOPIFY_API_KEY=paste_your_client_id_here
SHOPIFY_API_SECRET=paste_your_client_secret_here
SCOPES=read_products
HOST=https://multi-currency-converter.loca.lt
PORT=3000
DATABASE_URL=postgresql://localhost:5432/currency_app
NODE_ENV=development
```

The `HOST` line is already set from Step 1.

---

## Step 4 — Build & start

```bash
npm run setup
npm run dev
```

Or run server + tunnel in one command:

```bash
npm run dev:live
```

---

## Step 5 — Install on your development store

In your browser, go to:
```
https://multi-currency-converter.loca.lt/api/auth/install?shop=YOUR_STORE.myshopify.com
```

Replace `YOUR_STORE` with your Shopify dev store name.

You'll be taken through the OAuth flow → redirected to the embedded admin.

---

## Step 6 — Verify the storefront widget

Visit your dev store's storefront. You should see:
- A currency selector widget fixed at the **bottom-left** of every page
- Prices converting automatically based on selected country

---

## Step 7 — Test billing

1. In the admin, go to **Billing**
2. Click **Start Free Trial** on either plan
3. Approve the charge in Shopify (test mode — no real charge)
4. You'll be redirected back to the app

---

## Submit for App Store Review

### Required checklist

- [ ] App installed and working on a dev store
- [ ] Billing tested (7-day trial confirmed)
- [ ] Widget visible on storefront
- [ ] Privacy policy hosted at a public URL
- [ ] App icon uploaded (1200×1200px PNG)
- [ ] Screenshots uploaded (minimum 3)
- [ ] App description filled in Dev Dashboard

### App listing content

**App name:** `Multi Currency Converter`

**Tagline:** `Show prices in your customers' local currency, automatically`

**Description:**
```
Multi Currency Converter automatically detects your visitors' location and shows product
prices in their local currency — no theme changes required.

KEY FEATURES:

🌍 Auto-detect by location
Prices update instantly based on the visitor's country using IP geolocation.

💱 Manual currency selector
A clean, fixed widget lets customers choose their preferred currency from any page.

⚙️ Full admin control
Manage supported countries, set custom exchange rates, create pricing rules,
and configure the widget appearance from an intuitive dashboard.

📊 8 currencies pre-configured
USD, GBP, EUR, INR, AED, CAD, AUD, SGD — add or remove any country.

🔄 Auto-updated exchange rates
Rates refresh daily from a live API. Override any rate manually if needed.

📋 Custom pricing rules
Set percentage markups or fixed price overrides per country, sitewide.

🎨 Fully customizable widget
Change colors, position, and display options to match your brand.

No coding. No theme modifications. Works with all Shopify themes.

NOTE: Prices shown are for display only. Checkout uses Shopify's base currency.
For multi-currency checkout, enable Shopify Markets.
```

**Category:** Store design + Marketing and conversion

**Pricing:** From $5/month · 7-day free trial

---

## Privacy policy (host this at your domain)

```
Multi Currency Converter Privacy Policy — Last updated: October 2026

DATA WE COLLECT
• Shop domain and access token (required to operate the app)
• Country and currency configuration set by the merchant
• We do NOT collect, store, or process any customer personal data

DATA SHARING
We do not sell, rent, or share data with any third parties.
Exchange rates are fetched from a public API (open.er-api.com).
Country detection uses a public IP geolocation API (ip-api.com).

GDPR
We comply with all GDPR requirements. All shop data is permanently
deleted within 48 hours of uninstalling the app.

CONTACT: vaynoxstudio@gmail.com
```

---

## Production (permanent hosting, no tunnel)

```bash
# Set NODE_ENV=production in .env
# Set HOST to your real domain
# Then:
npm run start
```

For auto-restart use PM2:
```bash
npm install -g pm2
pm2 start server/index.js --name multi-currency-converter
pm2 save && pm2 startup
```
