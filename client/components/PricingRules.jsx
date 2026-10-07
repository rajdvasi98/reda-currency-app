import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

function RuleModal({ countries, onClose, onSave, initialData }) {
  const [form, setForm] = useState(initialData || {
    country_code: '', rule_type: 'all',
    shopify_resource_id: '', resource_title: '',
    price_override: '', percentage_adjustment: '',
    priority: 0, is_enabled: 1,
    override_type: 'percentage',
  });

  const isEdit = !!initialData;

  function handleSave() {
    const data = {
      country_code: form.country_code,
      rule_type: form.rule_type,
      shopify_resource_id: form.shopify_resource_id || null,
      resource_title: form.resource_title || null,
      price_override: form.override_type === 'fixed' ? parseFloat(form.price_override) || null : null,
      percentage_adjustment: form.override_type === 'percentage' ? parseFloat(form.percentage_adjustment) || null : null,
      priority: parseInt(form.priority) || 0,
      is_enabled: form.is_enabled,
    };
    onSave(data);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Pricing Rule' : 'Add Pricing Rule'}</h2>

        <div className="form-group">
          <label className="form-label">Country</label>
          <select className="form-select" value={form.country_code} onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}>
            <option value="">Select country…</option>
            {countries.map(c => <option key={c.country_code} value={c.country_code}>{c.flag_emoji} {c.country_name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Applies To</label>
          <select className="form-select" value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}>
            <option value="all">All Products</option>
            <option value="product">Specific Product</option>
            <option value="collection">Specific Collection</option>
          </select>
        </div>

        {form.rule_type !== 'all' && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Resource ID</label>
              <input type="text" className="form-input" placeholder="gid://shopify/Product/123"
                value={form.shopify_resource_id}
                onChange={e => setForm(f => ({ ...f, shopify_resource_id: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Label (optional)</label>
              <input type="text" className="form-input" placeholder="Product name…"
                value={form.resource_title}
                onChange={e => setForm(f => ({ ...f, resource_title: e.target.value }))} />
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Override Type</label>
          <select className="form-select" value={form.override_type} onChange={e => setForm(f => ({ ...f, override_type: e.target.value }))}>
            <option value="percentage">Percentage Adjustment (±%)</option>
            <option value="fixed">Fixed Price Override</option>
          </select>
        </div>

        {form.override_type === 'percentage' ? (
          <div className="form-group">
            <label className="form-label">Adjustment % (e.g. 10 for +10%, -5 for discount)</label>
            <input type="number" step="0.01" className="form-input"
              value={form.percentage_adjustment}
              onChange={e => setForm(f => ({ ...f, percentage_adjustment: e.target.value }))} />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Fixed Price (in target currency)</label>
            <input type="number" step="0.01" className="form-input"
              value={form.price_override}
              onChange={e => setForm(f => ({ ...f, price_override: e.target.value }))} />
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Priority (higher = wins)</label>
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
    if (!confirm('Delete this rule?')) return;
    await api.deleteRule(id);
    setRules(prev => prev.filter(r => r.id !== id));
    showAlert('Rule deleted');
  }

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Rules</h1>
          <p className="page-subtitle">Override prices for specific countries, products, or collections</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditRule(null); setShowModal(true); }}>
          + Add Rule
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <div className="card" style={{ marginBottom: 16, padding: '12px 20px', background: 'var(--bg3)' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          💡 Rules override the standard exchange rate conversion. Higher priority rules win. Use <strong>percentage</strong> for a markup/discount, or <strong>fixed price</strong> to set an exact amount in the target currency.
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Scope</th>
                <th>Override</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="emoji">📋</div>
                      <div>No pricing rules yet</div>
                      <div style={{ fontSize: 12, marginTop: 8 }}>Add rules to override exchange rate prices for specific countries or products</div>
                    </div>
                  </td>
                </tr>
              ) : rules.map(rule => {
                const country = countries.find(c => c.country_code === rule.country_code);
                return (
                  <tr key={rule.id}>
                    <td>
                      <span style={{ marginRight: 6 }}>{country?.flag_emoji || '🌐'}</span>
                      {rule.country_code}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {rule.rule_type === 'all' ? 'All products' :
                       rule.rule_type === 'product' ? `Product${rule.resource_title ? `: ${rule.resource_title}` : ''}` :
                       `Collection${rule.resource_title ? `: ${rule.resource_title}` : ''}`}
                    </td>
                    <td>
                      {rule.price_override != null
                        ? <span className="badge badge-blue">Fixed: {rule.price_override}</span>
                        : <span className="badge badge-green">{rule.percentage_adjustment > 0 ? '+' : ''}{rule.percentage_adjustment}%</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{rule.priority}</td>
                    <td>
                      <span className={`badge ${rule.is_enabled ? 'badge-green' : 'badge-red'}`}>
                        {rule.is_enabled ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                          setEditRule({ ...rule, override_type: rule.price_override != null ? 'fixed' : 'percentage' });
                          setShowModal(true);
                        }}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rule.id)}>✕</button>
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
