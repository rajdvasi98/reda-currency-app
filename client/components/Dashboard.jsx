import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

export default function Dashboard({ shopData, onNavigate }) {
  const [countries, setCountries] = useState([]);
  const [rates, setRates] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getCountries(), api.getRates(), api.getRules()])
      .then(([c, r, ru]) => { setCountries(c); setRates(r); setRules(ru); })
      .finally(() => setLoading(false));
  }, []);

  const enabledCountries = countries.filter(c => c.is_enabled);
  const lastRateUpdate = rates.length > 0
    ? new Date(rates[0].fetched_at).toLocaleString()
    : 'Never';

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your Multi Currency Converter configuration</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-value">{enabledCountries.length}</div>
          <div className="stat-label">Active Countries</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{rates.length}</div>
          <div className="stat-label">Exchange Rates</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{rules.filter(r => r.is_enabled).length}</div>
          <div className="stat-label">Pricing Rules</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{shopData?.default_currency || '—'}</div>
          <div className="stat-label">Base Currency</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-title">Active Countries</div>
          {enabledCountries.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div>No countries configured</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => onNavigate('countries')}>
                + Add Country
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {enabledCountries.slice(0, 6).map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>{c.flag_emoji || '🌐'}</span>
                  <span style={{ flex: 1 }}>{c.country_name}</span>
                  <span className="badge badge-blue">{c.currency_code}</span>
                </div>
              ))}
              {enabledCountries.length > 6 && (
                <div style={{ color: 'var(--text2)', fontSize: 12, paddingTop: 4 }}>
                  +{enabledCountries.length - 6} more…
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('countries')}>
              🌍 Manage Countries
            </button>
            <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('rates')}>
              💱 Update Exchange Rates
            </button>
            <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('rules')}>
              📋 Add Pricing Rule
            </button>
            <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => onNavigate('settings')}>
              ⚙️ Widget Settings
            </button>
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>RATES LAST UPDATED</div>
            <div style={{ fontSize: 12, color: 'var(--text)' }}>{lastRateUpdate}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <div className="card-title">📌 How It Works</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { icon: '📍', title: 'Auto-Detection', desc: 'Visitor location is detected by IP and matched to a configured country.' },
            { icon: '💱', title: 'Price Conversion', desc: 'Prices are converted using exchange rates + any adjustments you configure.' },
            { icon: '🔧', title: 'Manual Selector', desc: 'Fixed bottom-left widget lets visitors choose their own country/currency.' },
            { icon: '🛒', title: 'Cart & Checkout', desc: 'Converted prices are shown throughout the store. Checkout uses Shopify pricing.' },
          ].map(step => (
            <div key={step.title} style={{ padding: 14, background: 'var(--bg3)', borderRadius: 8 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{step.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
