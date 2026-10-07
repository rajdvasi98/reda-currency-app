import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

export default function ExchangeRates({ shopData }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editRate, setEditRate] = useState('');
  const [alert, setAlert] = useState(null);
  const [search, setSearch] = useState('');

  function showAlert(msg, type = 'success') {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 3000);
  }

  useEffect(() => {
    api.getRates().then(setRates).finally(() => setLoading(false));
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await api.refreshRates();
      if (result.success) {
        const updated = await api.getRates();
        setRates(updated);
        showAlert(`Updated ${result.count} exchange rates from live API`);
      } else {
        showAlert(result.error || 'Failed to fetch rates', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveRate(id) {
    const rate = parseFloat(editRate);
    if (isNaN(rate) || rate <= 0) {
      showAlert('Enter a valid positive rate', 'error');
      return;
    }
    try {
      const updated = await api.updateRate(id, rate);
      setRates(prev => prev.map(r => r.id === id ? updated : r));
      setEditId(null);
      showAlert('Rate updated (manual override)');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  const baseCurrency = shopData?.default_currency || 'USD';
  const filtered = rates.filter(r =>
    r.to_currency.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Exchange Rates</h1>
          <p className="page-subtitle">Rates from base currency ({baseCurrency}) to all others</p>
        </div>
        <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Rates'}
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <div className="card" style={{ marginBottom: 16, padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>🔍</span>
          <input
            className="form-input"
            style={{ maxWidth: 200 }}
            placeholder="Search currency…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {filtered.length} rates · Showing 1 {baseCurrency} =
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Currency</th>
                <th>Rate (1 {baseCurrency} =)</th>
                <th>Source</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="emoji">💱</div>
                      <div>No rates yet — click Refresh Rates</div>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(rate => (
                <tr key={rate.id}>
                  <td>
                    <strong className="mono">{rate.to_currency}</strong>
                  </td>
                  <td>
                    {editId === rate.id ? (
                      <input
                        type="number"
                        step="0.000001"
                        className="form-input"
                        style={{ width: 140 }}
                        value={editRate}
                        onChange={e => setEditRate(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveRate(rate.id)}
                      />
                    ) : (
                      <span className="mono">{rate.rate.toFixed(6)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${rate.source === 'manual' ? 'badge-blue' : 'badge-green'}`}>
                      {rate.source === 'manual' ? '✏️ Manual' : '🤖 Auto'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {new Date(rate.fetched_at).toLocaleString()}
                  </td>
                  <td>
                    {editId === rate.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveRate(rate.id)}>Save</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditId(rate.id); setEditRate(rate.rate.toString()); }}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
