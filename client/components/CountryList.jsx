import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

const ALL_COUNTRIES = [
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫' }, { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' }, { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' }, { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' }, { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'CN', name: 'China', flag: '🇨🇳' }, { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' }, { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' }, { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' }, { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' }, { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' }, { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' }, { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' }, { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' }, { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' }, { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' }, { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' }, { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' }, { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' }, { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' }, { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'US', name: 'United States', flag: '🇺🇸' }, { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
];

const ROUNDING_OPTIONS = [
  { value: 'none', label: 'None (exact)' },
  { value: 'nearest_99', label: 'Nearest .99' },
  { value: 'nearest_95', label: 'Nearest .95' },
  { value: 'nearest_integer', label: 'Nearest whole' },
  { value: 'nearest_10', label: 'Nearest 10' },
  { value: 'nearest_50', label: 'Nearest 50' },
  { value: 'nearest_100', label: 'Nearest 100' },
];

const ADJUSTMENT_TYPES = [
  { value: 'exchange_rate', label: 'Exchange Rate Only' },
  { value: 'percentage', label: 'Exchange Rate + Percentage Markup' },
  { value: 'fixed', label: 'Fixed Price Offset' },
];

function CountryModal({ onClose, onSave, currencies, initialData }) {
  const [form, setForm] = useState(initialData || {
    country_code: '', country_name: '', flag_emoji: '',
    currency_code: 'USD', price_adjustment_type: 'exchange_rate',
    price_adjustment_value: 0, rounding_rule: 'none', is_enabled: 1,
  });

  function setCountry(code) {
    const c = ALL_COUNTRIES.find(x => x.code === code);
    if (c) setForm(f => ({ ...f, country_code: c.code, country_name: c.name, flag_emoji: c.flag }));
  }

  const isEdit = !!initialData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Country' : 'Add Country'}</h2>

        {!isEdit && (
          <div className="form-group">
            <label className="form-label">Country</label>
            <select className="form-select" value={form.country_code} onChange={e => setCountry(e.target.value)}>
              <option value="">Select a country…</option>
              {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
          </div>
        )}

        {isEdit && (
          <div className="form-group">
            <label className="form-label">Country</label>
            <div style={{ padding: '9px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13 }}>
              {form.flag_emoji} {form.country_name} ({form.country_code})
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Currency</label>
          <select className="form-select" value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}>
            {currencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Price Adjustment</label>
          <select className="form-select" value={form.price_adjustment_type} onChange={e => setForm(f => ({ ...f, price_adjustment_type: e.target.value }))}>
            {ADJUSTMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {form.price_adjustment_type !== 'exchange_rate' && (
          <div className="form-group">
            <label className="form-label">
              {form.price_adjustment_type === 'percentage' ? 'Markup % (e.g. 5 for +5%)' : 'Fixed Offset (in target currency)'}
            </label>
            <input type="number" step="0.01" className="form-input" value={form.price_adjustment_value}
              onChange={e => setForm(f => ({ ...f, price_adjustment_value: parseFloat(e.target.value) || 0 })) } />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Rounding Rule</label>
          <select className="form-select" value={form.rounding_rule} onChange={e => setForm(f => ({ ...f, rounding_rule: e.target.value }))}>
            {ROUNDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>
            {isEdit ? 'Save Changes' : 'Add Country'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CountryList() {
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCountry, setEditCountry] = useState(null);
  const [alert, setAlert] = useState(null);

  function showAlert(msg, type = 'success') {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 3000);
  }

  useEffect(() => {
    Promise.all([api.getCountries(), api.getCurrencies()])
      .then(([c, cur]) => { setCountries(c); setCurrencies(cur); })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(form) {
    try {
      if (editCountry) {
        const updated = await api.updateCountry(editCountry.id, form);
        setCountries(prev => prev.map(c => c.id === updated.id ? updated : c));
        showAlert('Country updated');
      } else {
        const created = await api.createCountry(form);
        setCountries(prev => [...prev, created]);
        showAlert('Country added');
      }
      setShowModal(false);
      setEditCountry(null);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function handleToggle(country) {
    const updated = await api.updateCountry(country.id, { is_enabled: country.is_enabled ? 0 : 1 });
    setCountries(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  async function handleDelete(id) {
    if (!confirm('Remove this country?')) return;
    await api.deleteCountry(id);
    setCountries(prev => prev.filter(c => c.id !== id));
    showAlert('Country removed');
  }

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Countries</h1>
          <p className="page-subtitle">Configure which countries your store supports</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditCountry(null); setShowModal(true); }}>
          + Add Country
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Currency</th>
                <th>Adjustment</th>
                <th>Rounding</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {countries.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="emoji">🌍</div>
                      <div>No countries added yet</div>
                    </div>
                  </td>
                </tr>
              ) : countries.map(c => (
                <tr key={c.id}>
                  <td>
                    <span style={{ marginRight: 8, fontSize: 18 }}>{c.flag_emoji || '🌐'}</span>
                    <strong>{c.country_name}</strong>
                    <span style={{ color: 'var(--text2)', marginLeft: 6, fontSize: 12 }}>{c.country_code}</span>
                  </td>
                  <td><span className="badge badge-blue">{c.currency_code}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {c.price_adjustment_type === 'exchange_rate' ? 'Rate only' :
                     c.price_adjustment_type === 'percentage' ? `+${c.price_adjustment_value}%` :
                     `±${c.price_adjustment_value} fixed`}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {ROUNDING_OPTIONS.find(o => o.value === c.rounding_rule)?.label || 'None'}
                  </td>
                  <td>
                    <span className={`badge ${c.is_enabled ? 'badge-green' : 'badge-red'}`}>
                      {c.is_enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditCountry(c); setShowModal(true); }}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(c)}>
                        {c.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <CountryModal
          currencies={currencies}
          initialData={editCountry}
          onClose={() => { setShowModal(false); setEditCountry(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
