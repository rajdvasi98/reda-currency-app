/**
 * Multi Currency Converter Widget
 * Loaded via Shopify Theme App Extension (App Embed Block).
 * Handles auto geolocation, price conversion, and manual country/currency selector.
 */
(function () {
  'use strict';

  const APP_HOST = window.MULTICURRENCY_APP_HOST || (() => {
    const s = document.querySelector('script[src*="currency-widget"]');
    return s ? new URL(s.src).origin : '';
  })();
  const SHOP = Shopify.shop;
  const STORAGE_KEY = 'mc_currency_country';
  const CONFIG_KEY = 'mc_currency_config';
  const CONFIG_TTL = 5 * 60 * 1000; // 5 minutes

  let config = null;
  let currentCountry = null;
  let observer = null;
  let widgetEl = null;

  // ─── Utilities ──────────────────────────────────────────────────────────────

  function getCachedConfig() {
    try {
      const raw = sessionStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > CONFIG_TTL) return null;
      return data;
    } catch { return null; }
  }

  function setCachedConfig(data) {
    try {
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
  }

  function getSavedCountry() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function saveCountry(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }

  // ─── Config Loading ──────────────────────────────────────────────────────────

  async function loadConfig() {
    const cached = getCachedConfig();
    if (cached) return cached;

    const res = await fetch(`${APP_HOST}/api/proxy/config?shop=${SHOP}`);
    if (!res.ok) throw new Error('Failed to load currency config');
    const data = await res.json();
    setCachedConfig(data);
    return data;
  }

  // ─── Country Detection ───────────────────────────────────────────────────────

  async function detectCountry(cfg) {
    if (!cfg.settings.autoDetect) return null;
    try {
      const res = await fetch(`${APP_HOST}/api/proxy/detect?shop=${SHOP}`);
      const data = await res.json();
      if (data.detected && data.country) return data.country;
    } catch {}
    return null;
  }

  function resolveCountry(cfg) {
    // 1. User's saved manual selection
    const saved = getSavedCountry();
    if (saved) {
      const match = cfg.countries.find(c => c.country_code === saved);
      if (match) return match;
    }
    return null;
  }

  // ─── Price Formatting ────────────────────────────────────────────────────────

  function formatPrice(amount, currencyCode, cfg) {
    const currency = cfg.currencies[currencyCode];
    if (!currency) return `${currencyCode} ${amount.toFixed(2)}`;

    const dp = currency.decimal_places;
    const fixed = amount.toFixed(dp);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousand_separator);
    const formatted = dp > 0 ? parts.join(currency.decimal_separator) : parts[0];

    return currency.symbol_position === 'before'
      ? `${currency.symbol}${formatted}`
      : `${formatted} ${currency.symbol}`;
  }

  function parseShopifyPrice(el) {
    // Try data attribute first (most reliable)
    const raw = el.dataset.mcOriginal || el.dataset.productPrice || el.dataset.cartPrice;
    if (raw) return parseFloat(raw) / 100;

    // Parse from text content
    const text = el.textContent.replace(/[^\d.,]/g, '').trim();
    if (!text) return null;

    // Handle formats like 1.234,56 and 1,234.56
    let normalized = text;
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) {
      // European: 1.234,56
      normalized = text.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,234.56
      normalized = text.replace(/,/g, '');
    }

    const val = parseFloat(normalized);
    return isNaN(val) ? null : val;
  }

  // ─── Price Conversion ────────────────────────────────────────────────────────

  function convertAmount(baseAmount, baseCurrency, countryConfig, cfg) {
    if (!countryConfig) return { price: baseAmount, currency: baseCurrency };

    const targetCurrency = countryConfig.currency_code;
    if (targetCurrency === baseCurrency) return { price: baseAmount, currency: baseCurrency };

    const rate = cfg.rates[targetCurrency];
    if (!rate) return { price: baseAmount, currency: baseCurrency };

    let price = baseAmount * rate;

    // Apply country-level adjustment
    if (countryConfig.price_adjustment_type === 'percentage' && countryConfig.price_adjustment_value) {
      price *= (1 + countryConfig.price_adjustment_value / 100);
    } else if (countryConfig.price_adjustment_type === 'fixed' && countryConfig.price_adjustment_value) {
      price += countryConfig.price_adjustment_value;
    }

    // Apply rounding
    price = applyRounding(price, countryConfig.rounding_rule);

    return { price, currency: targetCurrency };
  }

  function applyRounding(price, rule) {
    switch (rule) {
      case 'nearest_99': return Math.floor(price) + 0.99;
      case 'nearest_95': return Math.floor(price) + 0.95;
      case 'nearest_integer': return Math.round(price);
      case 'nearest_10': return Math.round(price / 10) * 10;
      case 'nearest_50': return Math.round(price / 50) * 50;
      case 'nearest_100': return Math.round(price / 100) * 100;
      default: return price;
    }
  }

  // ─── DOM Price Rewriting ─────────────────────────────────────────────────────

  // All common Shopify price selectors across popular themes (Dawn, Debut, Brooklyn, etc.)
  const PRICE_SELECTORS = [
    '.money',
    '.price',
    '[data-product-price]',
    '[data-cart-price]',
    '[data-regular-price]',
    '[data-compare-price]',
    '.product__price .price-item',
    '.product-price',
    '.cart__price',
    '.cart-item__price',
    '.cart-item__old-price',
    '.order-summary__emphasis',
    '.product__price',
    '.price__regular .price-item',
    '.price__sale .price-item',
    '.price-item--sale',
    '.price-item--regular',
    '.totals__subtotal-value',
    '[class*="ProductPrice"]',
    '[class*="product-price"]',
    '[class*="Price__"]',
    '.gift-card__price',
  ].join(',');

  function rewritePrices(countryConfig, cfg) {
    const elements = document.querySelectorAll(PRICE_SELECTORS);

    elements.forEach(el => {
      // Skip already-converted (with no original stored)
      if (!el.dataset.mcOriginal) {
        const original = parseShopifyPrice(el);
        if (original === null || original === 0) return;
        el.dataset.mcOriginal = Math.round(original * 100);
      }

      const originalCents = parseInt(el.dataset.mcOriginal);
      const originalPrice = originalCents / 100;

      if (!countryConfig || countryConfig.currency_code === cfg.baseCurrency) {
        // Restore original if switching back to base currency
        if (el.dataset.mcFormatted) {
          el.textContent = el.dataset.mcFormatted;
          delete el.dataset.mcFormatted;
        }
        return;
      }

      // Store original formatted text once
      if (!el.dataset.mcFormatted) {
        el.dataset.mcFormatted = el.textContent.trim();
      }

      const { price, currency } = convertAmount(originalPrice, cfg.baseCurrency, countryConfig, cfg);
      el.textContent = formatPrice(price, currency, cfg);
    });
  }

  // Observe DOM for dynamic content (AJAX cart, infinite scroll, quick views)
  function startObserver(countryConfig, cfg) {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let shouldRewrite = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldRewrite = true;
          break;
        }
      }
      if (shouldRewrite) {
        // Small debounce to let DOM settle
        clearTimeout(observer._timer);
        observer._timer = setTimeout(() => rewritePrices(countryConfig, cfg), 150);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Widget UI ───────────────────────────────────────────────────────────────

  function buildWidget(cfg, activeCountry) {
    const s = cfg.settings;
    const isBottomLeft = !s.widgetPosition || s.widgetPosition === 'bottom-left';

    const el = document.createElement('div');
    el.id = 'mc-currency-widget';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Currency selector');

    const styles = `
      #mc-currency-widget {
        position: fixed;
        ${isBottomLeft ? 'left: 16px' : 'right: 16px'};
        bottom: 16px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
      }
      #mc-currency-widget * { box-sizing: border-box; margin: 0; padding: 0; }
      .mc-trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        background: ${s.widgetBgColor};
        color: ${s.widgetTextColor};
        border: none;
        border-radius: 24px;
        padding: 8px 14px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.3px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
        transition: transform 0.15s, box-shadow 0.15s;
        white-space: nowrap;
        user-select: none;
      }
      .mc-trigger:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
      .mc-trigger:active { transform: translateY(0); }
      .mc-trigger svg { flex-shrink: 0; }
      .mc-dropdown {
        position: absolute;
        ${isBottomLeft ? 'left: 0' : 'right: 0'};
        bottom: calc(100% + 8px);
        background: ${s.widgetBgColor};
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35);
        overflow: hidden;
        min-width: 220px;
        max-height: 320px;
        display: none;
        flex-direction: column;
      }
      .mc-dropdown.open { display: flex; }
      .mc-dropdown-header {
        padding: 12px 16px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: ${s.widgetAccentColor};
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .mc-list {
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .mc-list::-webkit-scrollbar { width: 4px; }
      .mc-list::-webkit-scrollbar-track { background: transparent; }
      .mc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
      .mc-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 16px;
        cursor: pointer;
        color: ${s.widgetTextColor};
        transition: background 0.1s;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-size: 13px;
      }
      .mc-item:hover { background: rgba(255,255,255,0.08); }
      .mc-item.active { background: rgba(255,255,255,0.12); }
      .mc-item.active::after {
        content: '✓';
        margin-left: auto;
        color: ${s.widgetAccentColor};
        font-size: 12px;
      }
      .mc-flag { font-size: 18px; line-height: 1; }
      .mc-country-info { display: flex; flex-direction: column; line-height: 1.3; }
      .mc-country-name { font-weight: 500; font-size: 13px; }
      .mc-currency-code { font-size: 11px; opacity: 0.65; }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const activeLabel = activeCountry
      ? `${s.showFlags ? activeCountry.flag_emoji + ' ' : ''}${s.showCountryName ? activeCountry.country_name : activeCountry.currency_code}`
      : '🌐 Select';

    el.innerHTML = `
      <div class="mc-dropdown" id="mc-dropdown" role="listbox" aria-label="Select country">
        <div class="mc-dropdown-header">Select your country</div>
        <div class="mc-list" id="mc-list"></div>
      </div>
      <button class="mc-trigger" id="mc-trigger" aria-haspopup="listbox" aria-expanded="false">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <path d="M12 2C12 2 8 6 8 12s4 10 4 10 4-6 4-10S12 2 12 2z" stroke="currentColor" stroke-width="2"/>
          <path d="M2 12h20" stroke="currentColor" stroke-width="2"/>
        </svg>
        <span id="mc-active-label">${activeLabel}</span>
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" style="opacity:0.6">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    document.body.appendChild(el);
    widgetEl = el;

    // Populate country list
    populateList(cfg, activeCountry);

    // Toggle dropdown
    const trigger = el.querySelector('#mc-trigger');
    const dropdown = el.querySelector('#mc-dropdown');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Keyboard support
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });

    return el;
  }

  function populateList(cfg, activeCountry) {
    const list = document.getElementById('mc-list');
    if (!list) return;
    list.innerHTML = '';

    cfg.countries.forEach(country => {
      const btn = document.createElement('button');
      btn.className = 'mc-item' + (activeCountry?.country_code === country.country_code ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', activeCountry?.country_code === country.country_code ? 'true' : 'false');
      btn.innerHTML = `
        ${cfg.settings.showFlags ? `<span class="mc-flag">${country.flag_emoji || '🌐'}</span>` : ''}
        <span class="mc-country-info">
          <span class="mc-country-name">${country.country_name}</span>
          <span class="mc-currency-code">${country.currency_code}</span>
        </span>
      `;
      btn.addEventListener('click', () => selectCountry(country, cfg));
      list.appendChild(btn);
    });
  }

  function updateTriggerLabel(country, cfg) {
    const s = cfg.settings;
    const labelEl = document.getElementById('mc-active-label');
    if (!labelEl) return;
    labelEl.textContent = country
      ? `${s.showFlags ? (country.flag_emoji || '🌐') + ' ' : ''}${s.showCountryName ? country.country_name : country.currency_code}`
      : '🌐 Select';
  }

  function selectCountry(country, cfg) {
    currentCountry = country;
    saveCountry(country.country_code);
    updateTriggerLabel(country, cfg);
    populateList(cfg, country);

    // Close dropdown
    const dropdown = document.getElementById('mc-dropdown');
    const trigger = document.getElementById('mc-trigger');
    if (dropdown) dropdown.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    // Clear cached conversions and rewrite prices
    document.querySelectorAll('[data-mc-original]').forEach(el => {
      delete el.dataset.mcFormatted;
    });
    rewritePrices(country, cfg);
  }

  // ─── Main Init ───────────────────────────────────────────────────────────────

  async function init() {
    try {
      config = await loadConfig();

      if (!config.countries || config.countries.length === 0) return;

      // Determine active country
      let activeCountry = resolveCountry(config);

      if (!activeCountry && config.settings.autoDetect) {
        const detected = await detectCountry(config);
        if (detected) {
          activeCountry = detected;
          saveCountry(detected.country_code);
        }
      }

      if (!activeCountry && config.settings.fallbackCountry) {
        activeCountry = config.countries.find(c => c.country_code === config.settings.fallbackCountry);
      }

      currentCountry = activeCountry;

      // Build widget
      buildWidget(config, activeCountry);

      // Initial price rewrite
      if (activeCountry) {
        rewritePrices(activeCountry, config);
        startObserver(activeCountry, config);
      }
    } catch (err) {
      console.warn('[Multi Currency Converter] Init error:', err);
    }
  }

  // Start after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Give theme JS a moment to render prices
    setTimeout(init, 300);
  }
})();
