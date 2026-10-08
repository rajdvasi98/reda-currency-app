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
  const FLAG_CDN = 'https://flagcdn.com';

  let config = null;
  let currentCountry = null;
  let observer = null;
  let widgetEl = null;

  function getFlagUrl(countryCode, size) {
    if (!countryCode || countryCode.length !== 2) return '';
    return `${FLAG_CDN}/${size || 'w40'}/${countryCode.toLowerCase()}.png`;
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
        ${isLeft ? 'left: 20px' : 'right: 20px'};
        bottom: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      #mc-currency-widget * { box-sizing: border-box; margin: 0; padding: 0; }

      .mc-trigger {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: #ffffff;
        color: #1a1a1a;
        border: none;
        border-radius: 100px;
        padding: 8px 16px 8px 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.1);
        transition: box-shadow 0.2s ease, transform 0.15s ease;
        white-space: nowrap;
        user-select: none;
        outline: none;
      }
      .mc-trigger:hover {
        box-shadow: 0 2px 6px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.14);
        transform: translateY(-1px);
      }
      .mc-trigger:active { transform: translateY(0); box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.1); }
      .mc-trigger:focus-visible { box-shadow: 0 0 0 2px #3b82f6, 0 4px 16px rgba(0,0,0,0.1); }

      .mc-trigger-flag {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid #f0f0f0;
        flex-shrink: 0;
        background: #f5f5f5;
      }
      .mc-trigger-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mc-trigger-name {
        font-size: 14px;
        font-weight: 600;
        color: #1a1a1a;
        letter-spacing: -0.01em;
      }
      .mc-trigger-code {
        font-size: 11px;
        font-weight: 600;
        color: #6b7280;
        background: #f3f4f6;
        padding: 2px 8px;
        border-radius: 6px;
        letter-spacing: 0.02em;
      }
      .mc-trigger-chevron {
        flex-shrink: 0;
        color: #9ca3af;
        transition: transform 0.2s ease;
        margin-left: 2px;
      }
      .mc-trigger[aria-expanded="true"] .mc-trigger-chevron { transform: rotate(180deg); }

      .mc-dropdown {
        position: absolute;
        ${isLeft ? 'left: 0' : 'right: 0'};
        bottom: calc(100% + 10px);
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: 16px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.12);
        overflow: hidden;
        width: 320px;
        max-height: 440px;
        display: none;
        flex-direction: column;
        transform-origin: bottom ${isLeft ? 'left' : 'right'};
      }
      .mc-dropdown.open {
        display: flex;
        animation: mc-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes mc-slide-up {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .mc-header {
        padding: 16px 16px 14px;
        border-bottom: 1px solid #f3f4f6;
      }
      .mc-header-title {
        font-size: 15px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 12px;
        letter-spacing: -0.01em;
      }

      .mc-search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f9fafb;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        padding: 9px 12px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .mc-search-wrap:focus-within {
        border-color: #3b82f6;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
      }
      .mc-search-icon { color: #9ca3af; flex-shrink: 0; }
      .mc-search {
        background: none;
        border: none;
        outline: none;
        color: #111827;
        font-size: 14px;
        font-family: inherit;
        width: 100%;
        line-height: 1.4;
      }
      .mc-search::placeholder { color: #9ca3af; }

      .mc-list {
        overflow-y: auto;
        flex: 1;
        padding: 6px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: #d1d5db transparent;
      }
      .mc-list::-webkit-scrollbar { width: 4px; }
      .mc-list::-webkit-scrollbar-track { background: transparent; }
      .mc-list::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

      .mc-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        color: #374151;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-size: 14px;
        font-family: inherit;
        border-radius: 10px;
        transition: background 0.1s ease;
        position: relative;
        outline: none;
      }
      .mc-item:hover { background: #f9fafb; }
      .mc-item:focus-visible { background: #f3f4f6; box-shadow: inset 0 0 0 2px #3b82f6; }
      .mc-item.active { background: #eff6ff; }
      .mc-item.active:hover { background: #dbeafe; }
      .mc-item[hidden] { display: none; }

      .mc-flag {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 2px solid #f3f4f6;
        background: #f9fafb;
      }
      .mc-item.active .mc-flag { border-color: #bfdbfe; }

      .mc-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .mc-item-name {
        font-weight: 500;
        font-size: 14px;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }
      .mc-item-sub {
        font-size: 12px;
        color: #6b7280;
        margin-top: 2px;
        line-height: 1.3;
      }
      .mc-check {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #3b82f6;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.5);
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .mc-item.active .mc-check { opacity: 1; transform: scale(1); }

      .mc-no-results {
        padding: 32px 16px;
        text-align: center;
        font-size: 13px;
        color: #9ca3af;
        display: none;
      }

      @media (max-width: 480px) {
        #mc-currency-widget { ${isLeft ? 'left: 12px' : 'right: 12px'}; bottom: 12px; }
        .mc-dropdown { width: calc(100vw - 24px); max-height: 380px; }
        .mc-trigger { padding: 6px 14px 6px 6px; }
        .mc-trigger-flag { width: 28px; height: 28px; }
        .mc-trigger-name { font-size: 13px; }
        .mc-search { font-size: 16px; }
        .mc-item { padding: 12px; }
        .mc-flag { width: 32px; height: 32px; }
      }
    `;
    document.head.appendChild(styleEl);

    const flagSrc = activeCountry ? getFlagUrl(activeCountry.country_code, 'w80') : '';
    const name = activeCountry ? activeCountry.country_name : 'Select';
    const code = activeCountry ? activeCountry.currency_code : '';

    el.innerHTML = `
      <div class="mc-dropdown" id="mc-dropdown" role="listbox" aria-label="Select country">
        <div class="mc-header">
          <div class="mc-header-title">Select Country</div>
          <div class="mc-search-wrap">
            <svg class="mc-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24">
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
        ${flagSrc
          ? `<img class="mc-trigger-flag" id="mc-trigger-flag" src="${flagSrc}" alt="${name}" />`
          : `<span class="mc-trigger-flag" id="mc-trigger-flag" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🌐</span>`
        }
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

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const firstVisible = el.querySelector('#mc-list .mc-item:not([hidden])');
        if (firstVisible) firstVisible.focus();
      }
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
      if (e.target.classList.contains('mc-item')) {
        const items = Array.from(el.querySelectorAll('#mc-list .mc-item:not([hidden])'));
        const idx = items.indexOf(e.target);
        if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); items[idx + 1].focus(); }
        if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); items[idx - 1].focus(); }
        if (e.key === 'ArrowUp' && idx === 0) { e.preventDefault(); searchInput.focus(); }
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
      const flagUrl = getFlagUrl(country.country_code, 'w80');

      const btn = document.createElement('button');
      btn.className = 'mc-item' + (isActive ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.dataset.search = `${country.country_name} ${country.country_code} ${country.currency_code}`.toLowerCase();

      btn.innerHTML = `
        <img class="mc-flag" src="${flagUrl}" alt="${country.country_name}" loading="lazy" />
        <span class="mc-item-info">
          <span class="mc-item-name">${country.country_name}</span>
          <span class="mc-item-sub">${country.currency_code}${symbol ? ' · ' + symbol : ''}</span>
        </span>
        <span class="mc-check">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
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

  function updateTriggerLabel(country) {
    const flagEl = document.getElementById('mc-trigger-flag');
    const nameEl = document.getElementById('mc-trigger-name');
    const codeEl = document.getElementById('mc-trigger-code');

    if (flagEl && country) {
      if (flagEl.tagName === 'IMG') {
        flagEl.src = getFlagUrl(country.country_code, 'w80');
        flagEl.alt = country.country_name;
      } else {
        const img = document.createElement('img');
        img.className = 'mc-trigger-flag';
        img.id = 'mc-trigger-flag';
        img.src = getFlagUrl(country.country_code, 'w80');
        img.alt = country.country_name;
        flagEl.replaceWith(img);
      }
    }
    if (nameEl) nameEl.textContent = country ? country.country_name : 'Select';
    if (codeEl) codeEl.textContent = country ? country.currency_code : '';
  }

  function selectCountry(country, cfg) {
    currentCountry = country;
    saveCountry(country.country_code);
    updateTriggerLabel(country);
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
