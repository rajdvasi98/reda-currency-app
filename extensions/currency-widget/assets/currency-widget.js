(function () {
  'use strict';

  const APP_HOST = window.MULTICURRENCY_APP_HOST || (() => {
    const s = document.querySelector('script[src*="currency-widget"]');
    return s ? new URL(s.src).origin : '';
  })();
  const SHOP = Shopify.shop;
  const STORAGE_KEY = 'mc_currency_country';
  const CONFIG_KEY = 'mc_currency_config';
  const CONFIG_TTL = 30 * 1000;
  const FLAG_CDN = 'https://flagcdn.com';
  const DEFAULT_COLORS = { bg: '#ffffff', text: '#1a1a1a', accent: '#3b82f6' };

  let config = null;
  let currentCountry = null;
  let observer = null;
  let widgetEl = null;

  function getFlagUrl(countryCode, size) {
    if (!/^[A-Za-z]{2}$/.test(countryCode || '')) return '';
    return `${FLAG_CDN}/${size || 'w40'}/${countryCode.toLowerCase()}.png`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function safeColor(value, fallback) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '') ? value : fallback;
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
    const rulePercent = cfg.rules?.[countryConfig.country_code];
    if (typeof rulePercent === 'number' && rulePercent !== 0) {
      price *= (1 + rulePercent / 100);
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

  // Original storefront text per price element / text node, used to restore the base currency.
  const originalText = new WeakMap();
  const originalNodeText = new WeakMap();
  // What we last wrote; any other text means the theme updated the price (e.g. variant change).
  const writtenText = new WeakMap();
  const writtenNodeText = new WeakMap();
  const SKIP_TEXT_IN = 'script,style,noscript,textarea,select,option,[contenteditable],#mc-currency-widget,#mc-currency-widget-notice';

  const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Matches an amount written in the store's base currency format, e.g. "$1,234.50" or "$10.00 USD".
  // The look-behind keeps "A$12" or "C$12" (other dollar currencies) from matching.
  function moneyPattern(cfg) {
    const cur = cfg.currencies[cfg.baseCurrency] || {};
    const sym = escapeRegExp(cur.symbol || cfg.baseCurrency);
    const ts = escapeRegExp(cur.thousand_separator ?? ',');
    const ds = escapeRegExp(cur.decimal_separator ?? '.');
    const code = escapeRegExp(cfg.baseCurrency);
    const num = `\\d{1,3}(?:${ts}\\d{3})+(?:${ds}\\d{1,2})?|\\d+(?:${ds}\\d{1,2})?`;
    return cur.symbol_position === 'after'
      ? new RegExp(`(${num})\\s?${sym}(?:\\s?${code}\\b)?`, 'g')
      : new RegExp(`(?<![A-Za-z])${sym}\\s?(${num})(?:\\s?${code}\\b)?`, 'g');
  }

  function parseMoneyNumber(num, cfg) {
    const cur = cfg.currencies[cfg.baseCurrency] || {};
    const ts = cur.thousand_separator ?? ',';
    const ds = cur.decimal_separator ?? '.';
    return parseFloat(num.split(ts).join('').replace(ds, '.'));
  }

  function hasConvertedAncestor(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (originalText.has(el)) return true;
    }
    return false;
  }

  function rewritePrices(countryConfig, cfg) {
    const useBase = !countryConfig || countryConfig.currency_code === cfg.baseCurrency;
    const money = moneyPattern(cfg);
    const moneyTest = new RegExp(money.source);
    const convertText = text => text.replace(money, (match, num) => {
      const { price, currency } = convertAmount(parseMoneyNumber(num, cfg), cfg.baseCurrency, countryConfig, cfg);
      return formatPrice(price, currency, cfg);
    });

    document.querySelectorAll(PRICE_SELECTORS).forEach(el => {
      // Only rewrite innermost price elements so theme structure (sale/compare-at, hidden labels) survives.
      if (el.querySelector(PRICE_SELECTORS) || el.closest('#mc-currency-widget')) return;
      if (writtenText.has(el) && el.textContent !== writtenText.get(el)) {
        originalText.delete(el);
        delete el.dataset.mcOriginal;
      }
      if (!originalText.has(el)) {
        const original = parseShopifyPrice(el);
        if (original === null || original === 0) return;
        el.dataset.mcOriginal = Math.round(original * 100);
        originalText.set(el, el.textContent);
      }
      const original = originalText.get(el);
      let next = original;
      if (!useBase) {
        if (moneyTest.test(original)) {
          next = convertText(original);
        } else {
          const { price, currency } = convertAmount(parseInt(el.dataset.mcOriginal, 10) / 100, cfg.baseCurrency, countryConfig, cfg);
          next = formatPrice(price, currency, cfg);
        }
      }
      // Writing text triggers the MutationObserver, so only write real changes.
      if (el.textContent !== next) el.textContent = next;
      writtenText.set(el, next);
    });

    // Prices inside other text, e.g. selling plan labels ("Subscription $21.21") or cart details.
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || node.parentElement.closest(SKIP_TEXT_IN) || hasConvertedAncestor(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return originalNodeText.has(node) || moneyTest.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (writtenNodeText.has(node) && node.nodeValue !== writtenNodeText.get(node)) originalNodeText.delete(node);
      if (!originalNodeText.has(node)) originalNodeText.set(node, node.nodeValue);
      const original = originalNodeText.get(node);
      const next = useBase ? original : convertText(original);
      // Text edits are characterData mutations, which the observer ignores, so this cannot loop.
      if (node.nodeValue !== next) node.nodeValue = next;
      writtenNodeText.set(node, next);
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
    const showFlags = s.showFlags !== 0 && s.showFlags !== false;
    const showName = s.showCountryName !== 0 && s.showCountryName !== false;
    const bg = safeColor(s.widgetBgColor, DEFAULT_COLORS.bg);
    const text = safeColor(s.widgetTextColor, DEFAULT_COLORS.text);
    const accent = safeColor(s.widgetAccentColor, DEFAULT_COLORS.accent);

    const el = document.createElement('div');
    el.id = 'mc-currency-widget';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Currency selector');
    if (!showFlags) el.classList.add('mc-no-flags');
    if (!showName) el.classList.add('mc-no-name');

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #mc-currency-widget {
        --mc-bg: ${bg};
        --mc-text: ${text};
        --mc-accent: ${accent};
        --mc-muted: color-mix(in srgb, var(--mc-text) 60%, var(--mc-bg));
        --mc-subtle: color-mix(in srgb, var(--mc-text) 45%, var(--mc-bg));
        --mc-border: color-mix(in srgb, var(--mc-text) 10%, transparent);
        --mc-soft: color-mix(in srgb, var(--mc-text) 5%, var(--mc-bg));
        --mc-active: color-mix(in srgb, var(--mc-accent) 12%, var(--mc-bg));
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

      #mc-currency-widget .mc-trigger {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: var(--mc-bg);
        color: var(--mc-text);
        border: 1px solid var(--mc-border);
        border-radius: 100px;
        padding: 8px 16px 8px 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        font-family: inherit;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.1);
        transition: box-shadow 0.2s ease, transform 0.15s ease;
        white-space: nowrap;
        user-select: none;
        outline: none;
      }
      #mc-currency-widget.mc-no-flags .mc-trigger { padding-left: 16px; }
      #mc-currency-widget .mc-trigger:hover {
        box-shadow: 0 2px 6px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.14);
        transform: translateY(-1px);
      }
      #mc-currency-widget .mc-trigger:active { transform: translateY(0); }
      #mc-currency-widget .mc-trigger:focus-visible { box-shadow: 0 0 0 2px var(--mc-accent), 0 4px 16px rgba(0,0,0,0.1); }

      #mc-currency-widget .mc-trigger-flag {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--mc-border);
        flex-shrink: 0;
        background: var(--mc-soft);
      }
      #mc-currency-widget .mc-trigger-info { display: flex; align-items: center; gap: 8px; }
      #mc-currency-widget .mc-trigger-name { font-size: 14px; font-weight: 600; color: var(--mc-text); letter-spacing: -0.01em; }
      #mc-currency-widget .mc-trigger-code {
        font-size: 11px;
        font-weight: 600;
        color: var(--mc-muted);
        background: var(--mc-soft);
        padding: 2px 8px;
        border-radius: 6px;
        letter-spacing: 0.02em;
      }
      #mc-currency-widget .mc-trigger-code[hidden] { display: none; }
      #mc-currency-widget.mc-no-name .mc-trigger-name { display: none; }
      #mc-currency-widget.mc-no-name .mc-trigger-code { font-size: 13px; color: var(--mc-text); background: none; padding: 0; }
      #mc-currency-widget.mc-no-flags .mc-trigger-flag, #mc-currency-widget.mc-no-flags .mc-flag { display: none; }
      #mc-currency-widget .mc-trigger-chevron {
        flex-shrink: 0;
        color: var(--mc-subtle);
        transition: transform 0.2s ease;
        margin-left: 2px;
      }
      #mc-currency-widget .mc-trigger[aria-expanded="true"] .mc-trigger-chevron { transform: rotate(180deg); }

      #mc-currency-widget .mc-dropdown {
        position: absolute;
        ${isLeft ? 'left: 0' : 'right: 0'};
        bottom: calc(100% + 10px);
        background: var(--mc-bg);
        color: var(--mc-text);
        border: 1px solid var(--mc-border);
        border-radius: 16px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.12);
        overflow: hidden;
        width: 320px;
        max-height: 440px;
        display: none;
        flex-direction: column;
        transform-origin: bottom ${isLeft ? 'left' : 'right'};
      }
      #mc-currency-widget .mc-dropdown.open {
        display: flex;
        animation: mc-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes mc-slide-up {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      #mc-currency-widget .mc-header { padding: 16px 16px 14px; border-bottom: 1px solid var(--mc-border); }
      #mc-currency-widget .mc-header-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--mc-text);
        margin-bottom: 12px;
        letter-spacing: -0.01em;
      }

      #mc-currency-widget .mc-search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--mc-soft);
        border: 1.5px solid var(--mc-border);
        border-radius: 10px;
        padding: 9px 12px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      #mc-currency-widget .mc-search-wrap:focus-within {
        border-color: var(--mc-accent);
        background: var(--mc-bg);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--mc-accent) 15%, transparent);
      }
      #mc-currency-widget .mc-search-icon { color: var(--mc-subtle); flex-shrink: 0; }
      #mc-currency-widget .mc-search {
        background: none;
        border: none;
        outline: none;
        color: var(--mc-text);
        font-size: 14px;
        font-family: inherit;
        width: 100%;
        line-height: 1.4;
        height: auto;
        min-height: 0;
        box-shadow: none;
        -webkit-appearance: none;
        appearance: none;
      }
      #mc-currency-widget .mc-search:focus,
      #mc-currency-widget .mc-search:focus-visible { outline: none; box-shadow: none; }
      #mc-currency-widget .mc-search::placeholder { color: var(--mc-subtle); }

      #mc-currency-widget .mc-list {
        overflow-y: auto;
        flex: 1;
        padding: 6px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--mc-border) transparent;
      }
      #mc-currency-widget .mc-list::-webkit-scrollbar { width: 4px; }
      #mc-currency-widget .mc-list::-webkit-scrollbar-track { background: transparent; }
      #mc-currency-widget .mc-list::-webkit-scrollbar-thumb { background: var(--mc-border); border-radius: 4px; }

      #mc-currency-widget .mc-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        color: var(--mc-text);
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
      #mc-currency-widget .mc-item:hover { background: var(--mc-soft); }
      #mc-currency-widget .mc-item:focus-visible { background: var(--mc-soft); box-shadow: inset 0 0 0 2px var(--mc-accent); }
      #mc-currency-widget .mc-item.active { background: var(--mc-active); }
      #mc-currency-widget .mc-item[hidden] { display: none; }

      #mc-currency-widget .mc-flag {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 2px solid var(--mc-border);
        background: var(--mc-soft);
      }
      #mc-currency-widget .mc-item.active .mc-flag { border-color: color-mix(in srgb, var(--mc-accent) 35%, var(--mc-bg)); }

      #mc-currency-widget .mc-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      #mc-currency-widget .mc-item-name {
        font-weight: 500;
        font-size: 14px;
        color: var(--mc-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }
      #mc-currency-widget .mc-item-sub { font-size: 12px; color: var(--mc-muted); margin-top: 2px; line-height: 1.3; }
      #mc-currency-widget .mc-check {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--mc-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.5);
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      #mc-currency-widget .mc-item.active .mc-check { opacity: 1; transform: scale(1); }

      #mc-currency-widget.mc-no-results {
        padding: 32px 16px;
        text-align: center;
        font-size: 13px;
        color: var(--mc-subtle);
        display: none;
      }

      @media (max-width: 480px) {
        #mc-currency-widget { ${isLeft ? 'left: 12px' : 'right: 12px'}; bottom: 12px; }
        #mc-currency-widget .mc-dropdown { width: calc(100vw - 24px); max-height: 380px; }
        #mc-currency-widget .mc-trigger { padding: 6px 14px 6px 6px; }
        #mc-currency-widget.mc-no-flags .mc-trigger { padding-left: 14px; }
        #mc-currency-widget .mc-trigger-flag { width: 28px; height: 28px; }
        #mc-currency-widget .mc-trigger-name { font-size: 13px; }
        #mc-currency-widget .mc-search { font-size: 16px; }
        #mc-currency-widget .mc-item { padding: 12px; }
        #mc-currency-widget .mc-flag { width: 32px; height: 32px; }
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
      <button class="mc-trigger" id="mc-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Change country and currency">
        ${flagSrc
          ? `<img class="mc-trigger-flag" id="mc-trigger-flag" src="${flagSrc}" alt="" />`
          : `<span class="mc-trigger-flag" id="mc-trigger-flag" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🌐</span>`
        }
        <span class="mc-trigger-info">
          <span class="mc-trigger-name" id="mc-trigger-name">${escapeHtml(name)}</span>
          <span class="mc-trigger-code" id="mc-trigger-code"${code ? '' : ' hidden'}>${escapeHtml(code)}</span>
        </span>
        <svg class="mc-trigger-chevron" width="12" height="12" fill="none" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    document.body.appendChild(el);
    widgetEl = el;
    keepAbovePreviewBar(el);

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
        <img class="mc-flag" src="${flagUrl}" alt="" loading="lazy" />
        <span class="mc-item-info">
          <span class="mc-item-name">${escapeHtml(country.country_name)}</span>
          <span class="mc-item-sub">${escapeHtml(country.currency_code)}${symbol ? ' · ' + escapeHtml(symbol) : ''}</span>
        </span>
        <span class="mc-check">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" style="stroke: var(--mc-bg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
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
      } else {
        const img = document.createElement('img');
        img.className = 'mc-trigger-flag';
        img.id = 'mc-trigger-flag';
        img.src = getFlagUrl(country.country_code, 'w80');
        img.alt = '';
        flagEl.replaceWith(img);
      }
    }
    if (nameEl) nameEl.textContent = country ? country.country_name : 'Select';
    if (codeEl) {
      codeEl.textContent = country ? country.currency_code : '';
      codeEl.hidden = !country;
    }
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

    rewritePrices(country, cfg);
    startObserver(country, cfg);
  }

  // Shopify's preview bar (shown to logged-in staff) is fixed to the bottom of the storefront and
  // covers a bottom-corner widget, so sit just above it and follow its height.
  const PREVIEW_BAR_ID = 'PBarNextFrameWrapper';

  function keepAbovePreviewBar(el) {
    const apply = () => {
      const bar = document.getElementById(PREVIEW_BAR_ID);
      const height = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
      el.style.bottom = height > 0 ? `${Math.round(height) + 12}px` : '';
    };
    const watch = bar => {
      apply();
      if ('ResizeObserver' in window) new ResizeObserver(apply).observe(bar);
    };
    const bar = document.getElementById(PREVIEW_BAR_ID);
    if (bar) return watch(bar);
    let tries = 0;
    const timer = setInterval(() => {
      const found = document.getElementById(PREVIEW_BAR_ID);
      if (found) watch(found);
      if (found || ++tries >= 10) clearInterval(timer);
    }, 1000);
  }

  const INACTIVE_MESSAGES = {
    plan_required: 'Choose a plan in the Multi Currency Converter app to show the currency selector on your store.',
    not_installed: 'Open Multi Currency Converter from your Shopify admin to finish setting it up.',
    no_countries: 'Enable at least one country in the Multi Currency Converter app to show the currency selector.',
  };

  // Shoppers see nothing; the merchant sees why in the theme editor.
  function showInactive(reason) {
    const message = INACTIVE_MESSAGES[reason] || INACTIVE_MESSAGES.not_installed;
    console.info(`[Multi Currency Converter] Currency selector is hidden. ${message}`);
    if (!window.Shopify || !window.Shopify.designMode) return;
    const note = document.createElement('div');
    note.id = 'mc-currency-widget-notice';
    note.setAttribute('role', 'status');
    note.textContent = message;
    note.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;max-width:320px;' +
      'padding:12px 14px;background:#fff;color:#1a1a1a;border:1px solid #f59e0b;border-left-width:4px;' +
      'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);' +
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;';
    document.body.appendChild(note);
  }

  async function init() {
    try {
      config = await loadConfig();
      if (config.active === false) return showInactive(config.reason);
      if (!config.countries || config.countries.length === 0) return showInactive('no_countries');

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
