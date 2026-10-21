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

export const Avatar = ({ name = '?' }) => <div className="avatar">{name.trim().charAt(0).toUpperCase()}</div>;

export function Empty({ icon: Icon, children }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div>{children}</div>
    </div>
  );
}
