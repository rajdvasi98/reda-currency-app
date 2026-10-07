const params = new URLSearchParams(window.location.search);
const shop = params.get('shop') || '';

async function getSessionToken() {
  if (window.shopify) {
    try {
      return await window.shopify.idToken();
    } catch {}
  }
  return null;
}

async function apiFetch(path, options = {}) {
  const token = await getSessionToken();
  const url = path.includes('?') ? `${path}&shop=${shop}` : `${path}?shop=${shop}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Shop-Domain': shop,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  getShop: () => apiFetch('/api/auth/session'),

  getCountries: () => apiFetch('/api/countries'),
  createCountry: (data) => apiFetch('/api/countries', { method: 'POST', body: JSON.stringify(data) }),
  updateCountry: (id, data) => apiFetch(`/api/countries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCountry: (id) => apiFetch(`/api/countries/${id}`, { method: 'DELETE' }),

  getCurrencies: () => apiFetch('/api/currencies'),

  getRates: () => apiFetch('/api/exchange-rates'),
  refreshRates: () => apiFetch('/api/exchange-rates/refresh', { method: 'POST' }),
  updateRate: (id, rate) => apiFetch(`/api/exchange-rates/${id}`, { method: 'PUT', body: JSON.stringify({ rate }) }),

  getRules: () => apiFetch('/api/pricing-rules'),
  createRule: (data) => apiFetch('/api/pricing-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) => apiFetch(`/api/pricing-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (id) => apiFetch(`/api/pricing-rules/${id}`, { method: 'DELETE' }),

  getSettings: () => apiFetch('/api/settings'),
  updateSettings: (data) => apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),

  getPlans: () => apiFetch('/api/billing/plans'),
  getSubscription: () => apiFetch('/api/billing/subscription'),
  subscribe: (plan) => apiFetch('/api/billing/subscribe', { method: 'POST', body: JSON.stringify({ plan }) }),
  cancelSubscription: () => apiFetch('/api/billing/subscription', { method: 'DELETE' }),
};

export { shop };
