import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';
import { Flag } from './common.jsx';

const EXTENSION_HANDLE = 'currency-widget';
const EMBED_HANDLE = 'app-embed';

async function getEmbedStatus() {
  if (!window.shopify?.app?.extensions) return 'unknown';
  try {
    const extensions = await window.shopify.app.extensions();
    const ext = extensions.find(e => e.type === 'theme_app_extension' && e.handle === EXTENSION_HANDLE);
    const embed = ext?.activations?.find(a => a.handle === EMBED_HANDLE);
    return embed?.status === 'active' ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}

function WidgetSetupCard({ shopDomain }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    const check = () => getEmbedStatus().then(s => { if (!cancelled) setStatus(s); });
    check();
    window.addEventListener('focus', check);
    return () => { cancelled = true; window.removeEventListener('focus', check); };
  }, []);

  const apiKey = document.querySelector('script[data-api-key]')?.dataset.apiKey;
  const editorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${EMBED_HANDLE}`;
  const active = status === 'active';

  return (
    <div className="card" style={{ marginBottom: 20, border: active ? '1px solid var(--border)' : '2px solid var(--accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Storefront currency selector</div>
        {status !== 'loading' && status !== 'unknown' && (
          <span className={`badge ${active ? 'badge-green' : 'badge-red'}`}>
            {active ? '✓ Enabled on your live theme' : 'Not enabled yet'}
          </span>
        )}
      </div>
      {!active && (
        <ol style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, margin: '12px 0', paddingLeft: 20 }}>
          <li>Click <strong>Enable in theme editor</strong>. The theme editor opens in a new tab with the app embed selected.</li>
          <li>Make sure <strong>Multi Currency Converter</strong> is switched on under <strong>App embeds</strong>.</li>
          <li>Click <strong>Save</strong>, then come back to this tab. The status above updates automatically.</li>
        </ol>
      )}
      {active && (
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '12px 0' }}>
          Visitors now see the currency selector in the bottom corner of your store. To turn it off, switch off the app embed in the theme editor.
        </p>
      )}
      <button className={`btn ${active ? 'btn-secondary' : 'btn-primary'}`} onClick={() => window.open(editorUrl, '_blank')}>
        {active ? 'Open theme editor' : 'Enable in theme editor'}
      </button>
    </div>
  );
}

export default function Dashboard({ shopData, onNavigate }) {
  const [countries, setCountries] = useState([]);
  const [rates, setRates] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getCountries(), api.getRates(), api.getRules()])
      .then(([c, r, ru]) => { setCountries(c); setRates(r); setRules(ru); })
      .catch(() => {})
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

      <WidgetSetupCard shopDomain={shopData?.shop_domain} />

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
                  <Flag code={c.country_code} size={22} />
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
            { icon: '🔧', title: 'Manual Selector', desc: 'A floating selector in the bottom corner lets visitors choose their own country and currency.' },
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
