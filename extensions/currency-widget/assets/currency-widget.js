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
  const CONFIG_TTL = 5 * 60 * 1000;

  let config = null;
  let currentCountry = null;
  let observer = null;
  let widgetEl = null;

  function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '';
    const offset = 0x1F1E6 - 65;
    const first = code.charCodeAt(0);
    const second = code.charCodeAt(1);
    if (first < 65 || first > 90 || second < 65 || second > 90) return '';
    return String.fromCodePoint(first + offset) + String.fromCodePoint(second + offset);
  }

  function getFlag(country) {
    if (country.flag_emoji && country.flag_emoji.length > 1) return country.flag_emoji;
    return countryCodeToFlag(country.country_code) || '🌐';
  }

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

  async function loadConfig() {
    const cached = getCachedConfig();
    if (cached) return cached;
    const res = await fetch(`${APP_HOST}/api/proxy/config?shop=${SHOP}`);
    if (!res.ok) throw new Error('Failed to load currency config');
    const data = await res.json();
    setCachedConfig(data);
    return data;
  }

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
    const saved = getSavedCountry();
    if (saved) {
      const match = cfg.countries.find(c => c.country_code === saved);
      if (match) return match;
    }
    return null;
  }

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
    const raw = el.dataset.mcOriginal || el.dataset.productPrice || el.dataset.cartPrice;
    if (raw) return parseFloat(raw) / 100;
    const text = el.textContent.replace(/[^\d.,]/g, '').trim();
    if (!text) return null;
    let normalized = text;
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = text.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = text.replace(/,/g, '');
    }
    const val = parseFloat(normalized);
    return isNaN(val) ? null : val;
  }

  function convertAmount(baseAmount, baseCurrency, countryConfig, cfg) {
    if (!countryConfig) return { price: baseAmount, currency: baseCurrency };
    const targetCurrency = countryConfig.currency_code;
    if (targetCurrency === baseCurrency) return { price: baseAmount, currency: baseCurrency };
    const rate = cfg.rates[targetCurrency];
    if (!rate) return { price: baseAmount, currency: baseCurrency };
    let price = baseAmount * rate;
    if (countryConfig.price_adjustment_type === 'percentage' && countryConfig.price_adjustment_value) {
      price *= (1 + countryConfig.price_adjustment_value / 100);
    } else if (countryConfig.price_adjustment_type === 'fixed' && countryConfig.price_adjustment_value) {
      price += countryConfig.price_adjustment_value;
    }
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

  const PRICE_SELECTORS = [
    '.money', '.price', '[data-product-price]', '[data-cart-price]',
    '[data-regular-price]', '[data-compare-price]', '.product__price .price-item',
    '.product-price', '.cart__price', '.cart-item__price', '.cart-item__old-price',
    '.order-summary__emphasis', '.product__price', '.price__regular .price-item',
    '.price__sale .price-item', '.price-item--sale', '.price-item--regular',
    '.totals__subtotal-value', '[class*="ProductPrice"]', '[class*="product-price"]',
    '[class*="Price__"]', '.gift-card__price',
  ].join(',');

  function rewritePrices(countryConfig, cfg) {
    document.querySelectorAll(PRICE_SELECTORS).forEach(el => {
      if (!el.dataset.mcOriginal) {
        const original = parseShopifyPrice(el);
        if (original === null || original === 0) return;
        el.dataset.mcOriginal = Math.round(original * 100);
      }
      const originalPrice = parseInt(el.dataset.mcOriginal) / 100;
      if (!countryConfig || countryConfig.currency_code === cfg.baseCurrency) {
        if (el.dataset.mcFormatted) {
          el.textContent = el.dataset.mcFormatted;
          delete el.dataset.mcFormatted;
        }
        return;
      }
      if (!el.dataset.mcFormatted) el.dataset.mcFormatted = el.textContent.trim();
      const { price, currency } = convertAmount(originalPrice, cfg.baseCurrency, countryConfig, cfg);
      el.textContent = formatPrice(price, currency, cfg);
    });
  }

  function startObserver(countryConfig, cfg) {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes.length > 0)) {
        clearTimeout(observer._timer);
        observer._timer = setTimeout(() => rewritePrices(countryConfig, cfg), 150);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function buildWidget(cfg, activeCountry) {
    const s = cfg.settings;
    const isLeft = !s.widgetPosition || s.widgetPosition === 'bottom-left';

    const el = document.createElement('div');
    el.id = 'mc-currency-widget';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Currency selector');

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #mc-currency-widget {
        position: fixed;
        ${isLeft ? 'left: 18px' : 'right: 18px'};
        bottom: 18px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        font-size: 14px;
        line-height: 1.4;
        -webkit-font-smoothing: antialiased;
      }
      #mc-currency-widget * { box-sizing: border-box; margin: 0; padding: 0; }

      .mc-trigger {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: #fff;
        color: #1a1a1a;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 50px;
        padding: 10px 18px 10px 14px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        white-space: nowrap;
        user-select: none;
      }
      .mc-trigger:hover {
        box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06);
        transform: translateY(-1px);
      }
      .mc-trigger:active { transform: translateY(0); }
      .mc-trigger-flag { font-size: 22px; line-height: 1; flex-shrink: 0; }
      .mc-trigger-info {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mc-trigger-name {
        font-size: 14px;
        font-weight: 600;
        color: #1a1a1a;
      }
      .mc-trigger-code {
        font-size: 12px;
        font-weight: 500;
        color: #888;
        background: #f3f3f3;
        padding: 2px 7px;
        border-radius: 4px;
      }
      .mc-trigger-chevron {
        flex-shrink: 0;
        color: #999;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        margin-left: 2px;
      }
      .mc-trigger[aria-expanded="true"] .mc-trigger-chevron { transform: rotate(180deg); }

      .mc-dropdown {
        position: absolute;
        ${isLeft ? 'left: 0' : 'right: 0'};
        bottom: calc(100% + 8px);
        background: #fff;
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
        overflow: hidden;
        min-width: 300px;
        max-height: 420px;
        display: none;
        flex-direction: column;
        animation: mc-pop-up 0.25s cubic-bezier(0.32, 0.72, 0, 1);
      }
      @keyframes mc-pop-up {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .mc-dropdown.open { display: flex; }

      .mc-header {
        padding: 16px 16px 12px;
        border-bottom: 1px solid #f0f0f0;
      }
      .mc-header-title {
        font-size: 13px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 12px;
      }

      .mc-search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f7f7f8;
        border: 1.5px solid transparent;
        border-radius: 10px;
        padding: 9px 12px;
        transition: all 0.15s ease;
      }
      .mc-search-wrap:focus-within {
        border-color: #3b82f6;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
      }
      .mc-search-icon { color: #999; flex-shrink: 0; }
      .mc-search {
        background: none;
        border: none;
        outline: none;
        color: #1a1a1a;
        font-size: 13px;
        font-family: inherit;
        width: 100%;
      }
      .mc-search::placeholder { color: #aaa; }

      .mc-list {
        overflow-y: auto;
        flex: 1;
        padding: 6px;
        scrollbar-width: thin;
        scrollbar-color: #ddd transparent;
      }
      .mc-list::-webkit-scrollbar { width: 5px; }
      .mc-list::-webkit-scrollbar-track { background: transparent; }
      .mc-list::-webkit-scrollbar-thumb { background: #ddd; border-radius: 5px; }

      .mc-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        color: #333;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-size: 14px;
        font-family: inherit;
        border-radius: 10px;
        transition: background 0.12s ease;
        position: relative;
      }
      .mc-item:hover { background: #f5f5f7; }
      .mc-item.active { background: #eff6ff; }
      .mc-item[hidden] { display: none; }
      .mc-flag { font-size: 24px; line-height: 1; flex-shrink: 0; }
      .mc-item-info { flex: 1; min-width: 0; }
      .mc-item-name {
        font-weight: 500;
        font-size: 14px;
        color: #1a1a1a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mc-item-sub {
        font-size: 12px;
        color: #888;
        margin-top: 1px;
      }
      .mc-check {
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .mc-item.active .mc-check { opacity: 1; }

      .mc-no-results {
        padding: 24px 16px;
        text-align: center;
        font-size: 13px;
        color: #999;
        display: none;
      }

      @media (max-width: 480px) {
        .mc-dropdown { min-width: 280px; max-width: calc(100vw - 36px); max-height: 360px; }
        .mc-trigger { padding: 8px 14px 8px 10px; }
        .mc-trigger-flag { font-size: 20px; }
        .mc-trigger-name { font-size: 13px; }
        .mc-search { font-size: 16px; }
        .mc-item { padding: 12px; }
      }
    `;
    document.head.appendChild(styleEl);

    const flag = activeCountry ? getFlag(activeCountry) : '🌐';
    const name = activeCountry ? activeCountry.country_name : 'Select';
    const code = activeCountry ? activeCountry.currency_code : '';

    el.innerHTML = `
      <div class="mc-dropdown" id="mc-dropdown" role="listbox" aria-label="Select country">
        <div class="mc-header">
          <div class="mc-header-title">Select Country</div>
          <div class="mc-search-wrap">
            <svg class="mc-search-icon" width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
              <path d="M16.5 16.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input
              class="mc-search"
              id="mc-search"
              type="text"
              placeholder="Search country or currency..."
              autocomplete="off"
              spellcheck="false"
              aria-label="Search countries"
            />
          </div>
        </div>
        <div class="mc-list" id="mc-list" role="listbox"></div>
        <div class="mc-no-results" id="mc-no-results">No countries found</div>
      </div>
      <button class="mc-trigger" id="mc-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="mc-trigger-flag" id="mc-trigger-flag">${flag}</span>
        <span class="mc-trigger-info">
          <span class="mc-trigger-name" id="mc-trigger-name">${name}</span>
          ${code ? `<span class="mc-trigger-code" id="mc-trigger-code">${code}</span>` : ''}
        </span>
        <svg class="mc-trigger-chevron" width="12" height="12" fill="none" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    document.body.appendChild(el);
    widgetEl = el;

    populateList(cfg, activeCountry);

    const trigger = el.querySelector('#mc-trigger');
    const dropdown = el.querySelector('#mc-dropdown');
    const searchInput = el.querySelector('#mc-search');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        searchInput.value = '';
        filterList(cfg, currentCountry, '');
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    searchInput.addEventListener('input', () => {
      filterList(cfg, currentCountry, searchInput.value.trim());
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    return el;
  }

  function populateList(cfg, activeCountry) {
    const list = document.getElementById('mc-list');
    if (!list) return;
    list.innerHTML = '';

    cfg.countries.forEach(country => {
      const isActive = activeCountry?.country_code === country.country_code;
      const currency = cfg.currencies[country.currency_code];
      const symbol = currency?.symbol || '';
      const flag = getFlag(country);

      const btn = document.createElement('button');
      btn.className = 'mc-item' + (isActive ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.dataset.search = `${country.country_name} ${country.country_code} ${country.currency_code}`.toLowerCase();

      btn.innerHTML = `
        <span class="mc-flag">${flag}</span>
        <span class="mc-item-info">
          <span class="mc-item-name">${country.country_name}</span>
          <span class="mc-item-sub">${country.currency_code}${symbol ? ' · ' + symbol : ''}</span>
        </span>
        <span class="mc-check">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      `;

      btn.addEventListener('click', () => selectCountry(country, cfg));
      list.appendChild(btn);
    });
  }

  function filterList(cfg, activeCountry, query) {
    const q = query.toLowerCase();
    const items = document.querySelectorAll('#mc-list .mc-item');
    let visible = 0;

    items.forEach(item => {
      const matches = !q || item.dataset.search.includes(q);
      item.hidden = !matches;
      if (matches) visible++;
    });

    const noResults = document.getElementById('mc-no-results');
    if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
  }

  function updateTriggerLabel(country, cfg) {
    const flagEl = document.getElementById('mc-trigger-flag');
    const nameEl = document.getElementById('mc-trigger-name');
    const codeEl = document.getElementById('mc-trigger-code');
    if (flagEl) flagEl.textContent = country ? getFlag(country) : '🌐';
    if (nameEl) nameEl.textContent = country ? country.country_name : 'Select';
    if (codeEl) codeEl.textContent = country ? country.currency_code : '';
  }

  function selectCountry(country, cfg) {
    currentCountry = country;
    saveCountry(country.country_code);
    updateTriggerLabel(country, cfg);
    populateList(cfg, country);

    const dropdown = document.getElementById('mc-dropdown');
    const trigger = document.getElementById('mc-trigger');
    if (dropdown) dropdown.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    document.querySelectorAll('[data-mc-original]').forEach(el => {
      delete el.dataset.mcFormatted;
    });
    rewritePrices(country, cfg);
    startObserver(country, cfg);
  }

  async function init() {
    try {
      config = await loadConfig();
      if (!config.countries || config.countries.length === 0) return;

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
      buildWidget(config, activeCountry);

      if (activeCountry) {
        rewritePrices(activeCountry, config);
        startObserver(activeCountry, config);
      }
    } catch (err) {
      console.warn('[Multi Currency Converter] Init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();
