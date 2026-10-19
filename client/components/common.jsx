import React, { useState, useEffect } from 'react';

export function Flag({ code, size = 20 }) {
  const style = { width: size, height: size, borderRadius: '50%', flexShrink: 0, verticalAlign: 'middle' };
  if (!/^[A-Za-z]{2}$/.test(code || '')) {
    return <span style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.8 }}>🌐</span>;
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt=""
      width={size}
      height={size}
      style={{ ...style, objectFit: 'cover', border: '1px solid var(--border)' }}
    />
  );
}

// Two-step delete: browser confirm() dialogs can be blocked inside the Shopify admin iframe.
export function ConfirmDeleteButton({ onConfirm, label = '✕', ariaLabel = 'Delete' }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      className="btn btn-danger btn-sm"
      style={{ minWidth: 72, justifyContent: 'center' }}
      aria-label={armed ? 'Confirm delete' : ariaLabel}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? 'Confirm' : label}
    </button>
  );
}
