import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);

  function showAlert(msg, type = 'success') {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 3000);
  }

  useEffect(() => {
    api.getSettings().then(s => { setSettings(s); setLoading(false); });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      showAlert('Settings saved');
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function set(key, val) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  if (loading || !settings) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure the widget behavior and appearance</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Widget Behavior */}
        <div className="card">
          <div className="card-title">Widget Behavior</div>

          <div className="form-group">
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={!!settings.auto_detect_enabled}
                  onChange={e => set('auto_detect_enabled', e.target.checked ? 1 : 0)} />
                <span className="toggle-slider" />
              </label>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Auto-detect visitor country</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Detect location by IP on first visit</div>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Fallback Country</label>
            <input type="text" className="form-input" maxLength={2} style={{ width: 80 }}
              value={settings.fallback_country || 'US'}
              onChange={e => set('fallback_country', e.target.value.toUpperCase())} />
            <div className="form-hint">ISO 2-letter code used when detection fails (e.g. US)</div>
          </div>

          <div className="form-group">
            <label className="form-label">Widget Position</label>
            <select className="form-select" value={settings.widget_position || 'bottom-left'}
              onChange={e => set('widget_position', e.target.value)}>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>

          <div className="form-group">
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={!!settings.show_flags}
                  onChange={e => set('show_flags', e.target.checked ? 1 : 0)} />
                <span className="toggle-slider" />
              </label>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Show country flags</div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={!!settings.show_country_name}
                  onChange={e => set('show_country_name', e.target.checked ? 1 : 0)} />
                <span className="toggle-slider" />
              </label>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Show country name in trigger</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>When off, shows currency code only</div>
              </div>
            </div>
          </div>
        </div>

        {/* Widget Appearance */}
        <div className="card">
          <div className="card-title">Widget Appearance</div>

          <div className="form-group">
            <label className="form-label">Background Color</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" value={settings.widget_bg_color || '#1a1a2e'}
                onChange={e => set('widget_bg_color', e.target.value)}
                style={{ width: 40, height: 36, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
              <input type="text" className="form-input" style={{ flex: 1 }}
                value={settings.widget_bg_color || '#1a1a2e'}
                onChange={e => set('widget_bg_color', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Text Color</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" value={settings.widget_text_color || '#ffffff'}
                onChange={e => set('widget_text_color', e.target.value)}
                style={{ width: 40, height: 36, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
              <input type="text" className="form-input" style={{ flex: 1 }}
                value={settings.widget_text_color || '#ffffff'}
                onChange={e => set('widget_text_color', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Accent Color</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" value={settings.widget_accent_color || '#e94560'}
                onChange={e => set('widget_accent_color', e.target.value)}
                style={{ width: 40, height: 36, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
              <input type="text" className="form-input" style={{ flex: 1 }}
                value={settings.widget_accent_color || '#e94560'}
                onChange={e => set('widget_accent_color', e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginTop: 8 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Preview</div>
            <div style={{
              background: settings.widget_bg_color || '#1a1a2e',
              color: settings.widget_text_color || '#ffffff',
              borderRadius: 24,
              padding: '8px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            }}>
              🇺🇸 United States
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" style={{ opacity: 0.6 }}>
                <path d="M6 9l6 6 6-6" stroke={settings.widget_text_color || '#ffffff'} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Rate Updates */}
        <div className="card">
          <div className="card-title">Exchange Rate Updates</div>

          <div className="form-group">
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={!!settings.auto_update_rates}
                  onChange={e => set('auto_update_rates', e.target.checked ? 1 : 0)} />
                <span className="toggle-slider" />
              </label>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Auto-update rates</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Automatically fetch rates on schedule</div>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Update Interval (hours)</label>
            <input type="number" min="1" max="168" className="form-input" style={{ width: 100 }}
              value={settings.rate_update_interval || 24}
              onChange={e => set('rate_update_interval', parseInt(e.target.value) || 24)} />
            <div className="form-hint">Recommended: 24 hours (daily updates)</div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="card" style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)' }}>
          <div className="card-title" style={{ color: 'var(--accent)' }}>⚠️ Important Notes</div>
          <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 16, margin: 0 }}>
            <li>Prices shown in the storefront are <strong>for display only</strong>. Actual checkout uses Shopify's base currency.</li>
            <li>For multi-currency checkout, enable <strong>Shopify Markets</strong> in your Shopify admin.</li>
            <li>The widget is injected via Script Tag API and works without theme modifications.</li>
            <li>Exchange rates are fetched from a free public API and update daily.</li>
            <li>Customer's country preference is saved in their browser (localStorage).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
