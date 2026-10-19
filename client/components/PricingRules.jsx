import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';
import { Flag, ConfirmDeleteButton } from './common.jsx';

function RuleModal({ countries, onClose, onSave, initialData }) {
  const [form, setForm] = useState(initialData || {
    country_code: '', percentage_adjustment: '', priority: 0, is_enabled: 1,
  });
  const [error, setError] = useState(null);

  const isEdit = !!initialData;

  function handleSave() {
    const pct = Number(form.percentage_adjustment);
    if (!form.country_code) return setError('Select a country.');
    if (form.percentage_adjustment === '' || !Number.isFinite(pct) || pct < -90 || pct > 500) {
      return setError('Enter an adjustment between -90 and 500.');
    }
    onSave({
      country_code: form.country_code,
      percentage_adjustment: pct,
      priority: parseInt(form.priority, 10) || 0,
      is_enabled: form.is_enabled,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Pricing Rule' : 'Add Pricing Rule'}</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Country</label>
          <select className="form-select" value={form.country_code} onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}>
            <option value="">Select country…</option>
            {countries.map(c => <option key={c.country_code} value={c.country_code}>{c.country_name} ({c.currency_code})</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Price adjustment for all products (%)</label>
          <input type="number" step="0.01" className="form-input" placeholder="e.g. 10 for +10%, -5 for a 5% discount"
            value={form.percentage_adjustment}
            onChange={e => setForm(f => ({ ...f, percentage_adjustment: e.target.value }))} />
          <div className="form-hint">Applied after the exchange rate and the country's own adjustment, before rounding.</div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Priority (higher wins)</label>
            <input type="number" className="form-input" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 0 }}>
            <label className="toggle-wrap">
              <span style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Active</span>
              <label className="toggle" style={{ marginLeft: 8 }}>
                <input type="checkbox" checked={!!form.is_enabled} onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked ? 1 : 0 }))} />
                <span className="toggle-slider" />
              </label>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>{isEdit ? 'Save' : 'Add Rule'}</button>
        </div>
      </div>
    </div>
  );
}

export default function PricingRules() {
  const [rules, setRules] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [alert, setAlert] = useState(null);

  function showAlert(msg, type = 'success') {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 3000);
  }

  useEffect(() => {
    Promise.all([api.getRules(), api.getCountries()])
      .then(([r, c]) => { setRules(r); setCountries(c); })
      .catch(err => showAlert(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(form) {
    try {
      if (editRule) {
        const updated = await api.updateRule(editRule.id, form);
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
        showAlert('Rule updated');
      } else {
        const created = await api.createRule(form);
        setRules(prev => [...prev, created]);
        showAlert('Rule added');
      }
      setShowModal(false);
      setEditRule(null);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      showAlert('Rule deleted');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Rules</h1>
          <p className="page-subtitle">Mark up or discount prices for a country</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditRule(null); setShowModal(true); }}>
          + Add Rule
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <div className="card" style={{ marginBottom: 16, padding: '12px 20px', background: 'var(--bg3)' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          💡 A rule adds a percentage to every converted price shown to visitors from that country (use a negative number for a discount).
          If a country has several active rules, the one with the highest priority is used.
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Adjustment</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="emoji">📋</div>
                      <div>No pricing rules yet</div>
                      <div style={{ fontSize: 12, marginTop: 8 }}>Add a rule to mark up or discount prices for a country</div>
                    </div>
                  </td>
                </tr>
              ) : rules.map(rule => {
                const country = countries.find(c => c.country_code === rule.country_code);
                const supported = rule.rule_type === 'all' && rule.percentage_adjustment != null;
                return (
                  <tr key={rule.id}>
                    <td>
                      <span style={{ marginRight: 8 }}><Flag code={rule.country_code} size={18} /></span>
                      {country?.country_name || rule.country_code}
                    </td>
                    <td>
                      {supported
                        ? <span className="badge badge-green">{rule.percentage_adjustment > 0 ? '+' : ''}{rule.percentage_adjustment}%</span>
                        : <span className="badge badge-red">Unsupported — please delete</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{rule.priority}</td>
                    <td>
                      <span className={`badge ${rule.is_enabled ? 'badge-green' : 'badge-red'}`}>
                        {rule.is_enabled ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {supported && (
                          <button className="btn btn-secondary btn-sm" onClick={() => {
                            setEditRule({
                              country_code: rule.country_code,
                              percentage_adjustment: String(rule.percentage_adjustment),
                              priority: rule.priority,
                              is_enabled: rule.is_enabled,
                              id: rule.id,
                            });
                            setShowModal(true);
                          }}>Edit</button>
                        )}
                        <ConfirmDeleteButton ariaLabel="Delete rule" onConfirm={() => handleDelete(rule.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <RuleModal
          countries={countries}
          initialData={editRule}
          onClose={() => { setShowModal(false); setEditRule(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
