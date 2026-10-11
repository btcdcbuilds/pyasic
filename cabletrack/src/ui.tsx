import type { ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 900 } : undefined}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bar({ pct, color = 'var(--accent)' }: { pct: number; color?: string }) {
  return (
    <div className="bar">
      <div style={{ width: Math.max(0, Math.min(100, pct)) + '%', background: color }} />
    </div>
  );
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <label className="f" style={style}>
      {label}
      {children}
    </label>
  );
}

export function Num({
  value,
  onChange,
  step,
  min,
  placeholder,
  style,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      step={step}
      min={min}
      placeholder={placeholder}
      style={style}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted" style={{ padding: '24px 8px', textAlign: 'center' }}>{children}</div>;
}

export function confirmDelete(what: string) {
  return window.confirm(`Delete ${what}? This cannot be undone.`);
}
