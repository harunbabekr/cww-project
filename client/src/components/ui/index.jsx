import { useEffect, useState } from 'react';
import { LANGUAGES } from '../../lib/languages';

export function LanguageSelect({ value, onChange, label, withAuto = false, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {withAuto && <option value="auto">تحديد تلقائي</option>}
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native} — {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="row between" style={{ cursor: 'pointer' }}>
      <span>
        <strong style={{ fontWeight: 500 }}>{label}</strong>
        {hint && <small className="muted" style={{ display: 'block' }}>{hint}</small>}
      </span>
      <span className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

// لون ثابت لكل اسم (يسهّل التمييز بين المحادثات كما في تطبيقات المراسلة)
const hueOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const Avatar = ({ name = '?', online }) => (
  <div className="avatar" style={{ background: `hsl(${hueOf(name)} 38% 34%)` }}>
    {name.trim().charAt(0).toUpperCase()}
    {online && <i className="dot online" />}
  </div>
);

export function Empty({ icon: Icon, children }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div>{children}</div>
    </div>
  );
}

/** زر حذف بتأكيد من خطوتين (يعود تلقائياً بعد 3 ثوانٍ) — أريح من confirm() في الجوال */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'تأكيد الحذف', className = 'btn small ghost danger', disabled, ariaLabel }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" disabled={disabled} aria-label={ariaLabel} className={armed ? 'btn small danger' : className}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </button>
  );
}
