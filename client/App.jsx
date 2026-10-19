import React, { useState, useEffect } from 'react';
import { api, shop } from './utils/api.js';
import Dashboard from './components/Dashboard.jsx';
import CountryList from './components/CountryList.jsx';
import ExchangeRates from './components/ExchangeRates.jsx';
import PricingRules from './components/PricingRules.jsx';
import Settings from './components/Settings.jsx';
import Billing from './components/Billing.jsx';
import './styles.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'countries', label: '🌍 Countries' },
  { id: 'rates', label: '💱 Exchange Rates' },
  { id: 'rules', label: '📋 Pricing Rules' },
  { id: 'settings', label: '⚙️ Settings' },
  { id: 'billing', label: '💳 Billing' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [shopData, setShopData] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [declined] = useState(() => new URLSearchParams(window.location.search).get('subscribed') === '0');

  useEffect(() => {

    if (!shop) {
      setError('No shop domain found. Please access this app from your Shopify admin.');
      setLoading(false);
      return;
    }

    api.getShop()
      .then(data => {
        setShopData(data.shop);
        setSubscription(data.subscription);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Loading Multi Currency Converter…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <div className="error-card">
          <h2>⚠️ Connection Error</h2>
          <p>{error}</p>
          {!shop && <p className="hint">Open from <strong>Shopify Admin → Apps → Multi Currency Converter</strong></p>}
        </div>
      </div>
    );
  }

  const hasActiveSub = subscription?.status === 'active';
  const navItems = hasActiveSub ? NAV_ITEMS : NAV_ITEMS.filter(item => item.id === 'billing');
  const currentPage = hasActiveSub ? page : 'billing';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">💱</span>
          <div>
            <div className="brand-name">Multi Currency Converter</div>
            <div className="brand-shop">{shopData?.shop_domain}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="currency-badge">{shopData?.default_currency || 'USD'} base</div>
          <div className={`badge ${hasActiveSub ? 'badge-green' : 'badge-red'}`} style={{ marginTop: 8, display: 'block' }}>
            {hasActiveSub ? `✓ ${subscription.plan} plan` : 'No plan selected'}
          </div>
        </div>
      </aside>

      <main className="main-content">
        {currentPage === 'dashboard' && <Dashboard shopData={shopData} onNavigate={setPage} />}
        {currentPage === 'countries' && <CountryList />}
        {currentPage === 'rates' && <ExchangeRates shopData={shopData} />}
        {currentPage === 'rules' && <PricingRules />}
        {currentPage === 'settings' && <Settings />}
        {currentPage === 'billing' && <Billing subscription={subscription} declined={declined} />}
      </main>
    </div>
  );
}
