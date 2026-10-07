import React, { useState, useEffect } from 'react';
import { api } from '../utils/api.js';

const PLAN_FEATURES = {
  monthly: ['All currencies & countries', 'Auto geolocation detection', 'Custom pricing rules', 'Exchange rate auto-updates', 'Admin dashboard', '7-day free trial'],
  annual: ['Everything in Monthly', '2 months free (save $10)', 'Priority support', '7-day free trial'],
};

export default function Billing({ subscription }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    api.getPlans().then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(planId) {
    setSubscribing(planId);
    try {
      const result = await api.subscribe(planId);
      if (result.confirmationUrl) {
        window.top.location.href = result.confirmationUrl;
      }
    } catch (err) {
      setAlert({ msg: err.message, type: 'error' });
      setSubscribing(null);
    }
  }

  const isActive = subscription?.status === 'active';
  const isPending = subscription?.status === 'pending';

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscription</h1>
          <p className="page-subtitle">Choose a plan to activate Multi Currency Converter on your store</p>
        </div>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      {isActive && (
        <div className="alert alert-success" style={{ marginBottom: 20 }}>
          ✅ You have an active <strong>{subscription.plan}</strong> subscription.
          {subscription.current_period_end && ` Renews: ${new Date(subscription.current_period_end).toLocaleDateString()}`}
        </div>
      )}

      {isPending && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          ⏳ Subscription pending approval from Shopify.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 700 }}>
        {/* Monthly Plan */}
        <div className="card" style={{ border: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)' }}>$5</span>
            <span style={{ color: 'var(--text2)', fontSize: 14 }}>/month</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 16, fontWeight: 600 }}>7-day free trial</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PLAN_FEATURES.monthly.map(f => (
              <li key={f} style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--success)' }}>✓</span> {f}
              </li>
            ))}
          </ul>
          <button
            className={`btn btn-primary`}
            style={{ width: '100%', justifyContent: 'center', opacity: isActive && subscription.plan === 'monthly' ? 0.5 : 1 }}
            onClick={() => handleSubscribe('monthly')}
            disabled={subscribing || (isActive && subscription.plan === 'monthly')}
          >
            {subscribing === 'monthly' ? 'Redirecting…' : isActive && subscription.plan === 'monthly' ? 'Current Plan' : 'Start Free Trial'}
          </button>
        </div>

        {/* Annual Plan */}
        <div className="card" style={{ border: '2px solid var(--accent)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '3px 12px', borderRadius: 20, letterSpacing: '0.5px',
          }}>BEST VALUE</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Annual</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)' }}>$50</span>
            <span style={{ color: 'var(--text2)', fontSize: 14 }}>/year</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
            <del style={{ color: 'var(--danger)' }}>$60</del> — save $10
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 16, fontWeight: 600 }}>7-day free trial</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PLAN_FEATURES.annual.map(f => (
              <li key={f} style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--success)' }}>✓</span> {f}
              </li>
            ))}
          </ul>
          <button
            className={`btn btn-primary`}
            style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)', opacity: isActive && subscription.plan === 'annual' ? 0.5 : 1 }}
            onClick={() => handleSubscribe('annual')}
            disabled={subscribing || (isActive && subscription.plan === 'annual')}
          >
            {subscribing === 'annual' ? 'Redirecting…' : isActive && subscription.plan === 'annual' ? 'Current Plan' : 'Start Free Trial'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24, background: 'var(--bg3)', maxWidth: 700 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>About billing:</strong> Your 7-day free trial starts immediately. No charge until the trial ends.
          Subscription is managed by Shopify — you can cancel anytime from your Shopify Admin → Apps → Multi Currency Converter.
          All payments are processed securely by Shopify Payments.
        </div>
      </div>
    </div>
  );
}
