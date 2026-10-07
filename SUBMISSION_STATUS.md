# Multi Currency Converter — App Store Submission Status

## App Details
- **App Name:** Multi Currency Converter
- **App ID:** 432215228417
- **Partners Account:** vaynoxstudio@gmail.com (Profile 36 "Vaynox" in Chrome)
- **Partners Dashboard:** https://partners.shopify.com/5028492/apps/432215228417/distribution/app-store
- **API Key:** fcdbdc4e7b0cb086cfe38cd5f7ac5e7c
- **Contact Email:** vaynoxstudio@gmail.com

---

## What Is DONE ✅

1. **App built and running**
   - Node.js + Express backend at `C:\Application\REDA currency apps\server\`
   - React admin UI at `C:\Application\REDA currency apps\admin\`
   - Vanilla JS storefront widget
   - Server runs on `localhost:3000`

2. **All mandatory GDPR webhooks implemented**
   - `POST /api/webhooks/customers/redact`
   - `POST /api/webhooks/customers/data_request`
   - `POST /api/webhooks/shop/redact`
   - `POST /api/webhooks/app/uninstalled`
   - All verified with HMAC using timing-safe comparison (`crypto.timingSafeEqual`)
   - Code in: `server/routes/webhooks.js` and `server/middleware/hmac.js`

3. **Shopify Billing API implemented**
   - $5/month or $50/year plans
   - 7-day free trial
   - GraphQL `appSubscriptionCreate` mutation

4. **App Store listing created (English)**
   - Screenshots uploaded
   - Demo video hosted at: https://files.catbox.moe/f8jge8.mp4
   - All listing fields filled

5. **Preliminary steps — all green in Partners Dashboard**
   - ✅ Queries supported API versions
   - ✅ Fixed requirement issues with configuration
   - ✅ Added an emergency contact for your account
   - ✅ Created listing (English)
   - ✅ Doesn't need access to protected customer data

6. **Localtunnel working**
   - Subdomain: `multi-currency-converter`
   - URL: `https://multi-currency-converter.loca.lt`
   - This matches the `HOST` in `.env`
   - Start command: `npx localtunnel --port 3000 --subdomain multi-currency-converter`

---

## What Is PENDING ⏳

### STEP 1 — Start the server and tunnel (every session)
```bash
# Terminal 1 — Start server
cd "C:\Application\REDA currency apps"
node server/index.js

# Terminal 2 — Start tunnel
npx localtunnel --port 3000 --subdomain multi-currency-converter
```
Verify tunnel works:
```bash
curl -s -H "bypass-tunnel-reminder: true" https://multi-currency-converter.loca.lt/
```

### STEP 2 — Re-run automated checks in Partners Dashboard
- Log in to https://partners.shopify.com/5028492/apps/432215228417/distribution/app-store
  using **vaynoxstudio@gmail.com** (Chrome Profile 36 "Vaynox")
- Scroll down to **"Automated checks"** section
- Click **"Run"** next to:
  - "Provides mandatory compliance webhooks"
  - "Verifies webhooks with HMAC signatures"
- These failed previously because the tunnel was down — now they should PASS

### STEP 3 — Handle "Embedded app checks"
- These auto-run every 2 hours
- Require the app to be installed on a dev store
- Dev store must be connected and app session active

### STEP 4 — Click "Submit for review"
- Once all automated checks pass, the "Submit for review" button becomes enabled
- Click it to submit to Shopify App Store review team
- Review typically takes 5–7 business days

---

## Known Issues / Notes

- The localtunnel `multi-currency-converter` subdomain is NOT permanently reserved — must be started fresh each session. If another process grabs it, a random URL will be assigned and `.env` HOST must be updated.
- The "Recommended changes for Shopify App Store listing" warning (AI suggestions) is NOT a blocker — it is advisory only.
- Chrome Profile for Shopify Partners login: **Profile 36 — "Vaynox"** (`vaynoxstudio@gmail.com`). Open Chrome → click profile icon top-right → switch to "Vaynox".
- The Claude extension for browser automation connects to the **Default** Chrome profile (`rajendra.kumar@reda.one`), which does NOT have the Shopify Partners session — so browser automation for the Partners Dashboard requires manual login.

---

## File Locations
- Server: `C:\Application\REDA currency apps\server\`
- Admin UI: `C:\Application\REDA currency apps\admin\`
- Environment: `C:\Application\REDA currency apps\.env`
- Database: `C:\Application\REDA currency apps\server\database.sqlite`
- Webhooks: `server/routes/webhooks.js`
- HMAC middleware: `server/middleware/hmac.js`
- Auth/OAuth: `server/routes/auth.js`
