import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LoaderCircle, ShieldCheck, Mail, MessageSquareText, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errMsg } from '../../services/api';
import { COUNTRIES } from '../../lib/countries';
import { useFeatures } from '../../lib/features';
import Logo from '../../components/layout/Logo';

/*
 * الشاشات: login (كلمة مرور) | register (حساب جديد) | verify (رمز تأكيد الحساب)
 *          forgot (طلب رمز) | reset (رمز + كلمة مرور جديدة)
 * الرمز OTP لا يُطلب إلا في verify و reset.
 */
export default function Auth() {
  const { user, login, register, verify, forgot, reset } = useAuth();
  const features = useFeatures();
  const navigate = useNavigate();
  const [screen, setScreen] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', identifier: '', countryCode: '+249', phone: '', password: '', confirm: '' });
  const [channel, setChannel] = useState('email');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const smsOn = !!features.otp?.sms;
  const go = (s) => { setScreen(s); setError(''); setCode(''); };

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const checkPasswords = () => {
    if (form.password.length < 8) throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف');
    if (form.password !== form.confirm) throw new Error('كلمتا المرور غير متطابقتين');
  };

  const sendRegister = async () => {
    const res = await register({ name: form.name, email: form.email, countryCode: form.countryCode, phone: form.phone, password: form.password, channel });
    setSent(res); setCooldown(60); setScreen('verify');
  };
  const sendForgot = async () => {
    const res = await forgot(form.identifier, channel);
    setSent(res); setCooldown(60); setScreen('reset');
  };

  const onLogin = (e) => { e.preventDefault(); run(async () => { await login(form.identifier, form.password); navigate('/', { replace: true }); }); };
  const onRegister = (e) => { e.preventDefault(); run(async () => { checkPasswords(); await sendRegister(); }); };
  const onVerify = (e) => { e.preventDefault(); run(async () => { await verify(sent.email, code); navigate('/', { replace: true }); }); };
  const onForgot = (e) => { e.preventDefault(); run(sendForgot); };
  const onReset = (e) => {
    e.preventDefault();
    run(async () => { checkPasswords(); await reset(form.identifier, code, form.password); navigate('/', { replace: true }); });
  };

  const PasswordField = ({ id, label, field, autoComplete }) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} type={showPw ? 'text' : 'password'} className="input ltr" style={{ paddingRight: 42 }} autoComplete={autoComplete} value={form[field]} onChange={set(field)} required minLength={field === 'password' && screen !== 'login' ? 8 : undefined} />
        <button type="button" className="pw-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'إخفاء' : 'إظهار'}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
    </div>
  );

  const ChannelPicker = () => smsOn && (
    <div className="field">
      <label>أرسل الرمز عبر</label>
      <div className="chips">
        <button type="button" className={`chip${channel === 'email' ? ' active' : ''}`} onClick={() => setChannel('email')}><Mail size={14} /> البريد</button>
        <button type="button" className={`chip${channel === 'sms' ? ' active' : ''}`} onClick={() => setChannel('sms')}><MessageSquareText size={14} /> رسالة SMS</button>
      </div>
    </div>
  );

  const Submit = ({ children }) => <button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : children}</button>;
  const Err = () => error && <div className="alert error">{error}</div>;
  const DevCode = () => sent?.devCode && <div className="alert info">وضع التطوير (لا يوجد مزوّد إرسال مفعّل) — الرمز: <b>{sent.devCode}</b></div>;
  const Resend = ({ action }) => (
    <button type="button" className="btn ghost small" disabled={cooldown > 0 || busy} onClick={() => run(action)}>
      {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown}ث` : 'إعادة إرسال الرمز'}
    </button>
  );

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="row"><Logo size={48} /><strong style={{ fontSize: '1.3rem' }}>CWW</strong></div>
        <div>
          <h1>تكلّم بلغتك،<br />ويفهمك <em>العالم كله</em>.</h1>
          <p>ترجمة فورية للمحادثة وجهاً لوجه، والمكالمات، والرسائل، والفيديو، واللهجات المحلية — في تطبيق واحد.</p>
        </div>
        <div className="hero-words"><span>مرحباً</span><span>Sannu</span><span>Hello</span><span>Bonjour</span><span>こんにちは</span><span>Hola</span></div>
      </section>

      <section className="auth-form">
        <div className="auth-card card">
          {(screen === 'login' || screen === 'register') && (
            <div className="tabs">
              <button type="button" className={screen === 'login' ? 'active' : ''} onClick={() => go('login')}>تسجيل الدخول</button>
              <button type="button" className={screen === 'register' ? 'active' : ''} onClick={() => go('register')}>حساب جديد</button>
            </div>
          )}

          {screen === 'login' && (
            <form className="stack" onSubmit={onLogin}>
              <div className="field">
                <label htmlFor="idf">البريد الإلكتروني أو رقم الهاتف</label>
                <input id="idf" className="input ltr" autoComplete="username" placeholder="email@example.com أو +249123456789" value={form.identifier} onChange={set('identifier')} required />
              </div>
              {PasswordField({ id: 'pw', label: 'كلمة المرور', field: 'password', autoComplete: 'current-password' })}
              <Err />
              <Submit>دخول</Submit>
              <button type="button" className="link-btn" onClick={() => go('forgot')}>نسيت كلمة المرور؟</button>
            </form>
          )}

          {screen === 'register' && (
            <form className="stack" onSubmit={onRegister}>
              <div className="field"><label htmlFor="name">اسم المستخدم</label><input id="name" className="input" value={form.name} onChange={set('name')} required minLength={2} /></div>
              <div className="field"><label htmlFor="email">البريد الإلكتروني</label><input id="email" type="email" className="input ltr" autoComplete="email" value={form.email} onChange={set('email')} required /></div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ width: 150 }}>
                  <label htmlFor="cc">رمز الدولة</label>
                  <select id="cc" className="select" value={form.countryCode} onChange={set('countryCode')}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select>
                </div>
                <div className="field" style={{ flex: 1 }}><label htmlFor="phone">رقم الهاتف</label><input id="phone" inputMode="tel" className="input ltr" value={form.phone} onChange={set('phone')} required minLength={6} /></div>
              </div>
              {PasswordField({ id: 'pw1', label: 'كلمة المرور (8 أحرف على الأقل)', field: 'password', autoComplete: 'new-password' })}
              {PasswordField({ id: 'pw2', label: 'تأكيد كلمة المرور', field: 'confirm', autoComplete: 'new-password' })}
              {ChannelPicker()}
              <Err />
              <Submit>إنشاء الحساب وإرسال رمز التأكيد</Submit>
            </form>
          )}

          {screen === 'verify' && (
            <form className="stack" onSubmit={onVerify}>
              <div className="row"><ShieldCheck color="#2ba39b" /><h2 style={{ fontSize: '1.2rem' }}>تأكيد الحساب</h2></div>
              <p className="muted">أرسلنا رمزاً من 6 أرقام إلى <b className="ltr" style={{ display: 'inline-block', direction: 'ltr' }}>{sent?.sentTo}</b></p>
              {DevCode()}
              <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
              <Err />
              <Submit>تأكيد</Submit>
              <div className="row between">
                <button type="button" className="btn ghost small" onClick={() => go('register')}>رجوع</button>
                {Resend({ action: sendRegister })}
              </div>
            </form>
          )}

          {screen === 'forgot' && (
            <form className="stack" onSubmit={onForgot}>
              <div className="row"><KeyRound color="#e4572e" /><h2 style={{ fontSize: '1.2rem' }}>استعادة كلمة المرور</h2></div>
              <p className="muted">أدخل بريدك أو هاتفك وسنرسل لك رمزاً لتعيين كلمة مرور جديدة.</p>
              <div className="field"><label htmlFor="fid">البريد الإلكتروني أو رقم الهاتف</label><input id="fid" className="input ltr" placeholder="email@example.com أو +249123456789" value={form.identifier} onChange={set('identifier')} required /></div>
              {ChannelPicker()}
              <Err />
              <Submit>إرسال الرمز</Submit>
              <button type="button" className="link-btn" onClick={() => go('login')}>رجوع لتسجيل الدخول</button>
            </form>
          )}

          {screen === 'reset' && (
            <form className="stack" onSubmit={onReset}>
              <div className="row"><KeyRound color="#e4572e" /><h2 style={{ fontSize: '1.2rem' }}>كلمة مرور جديدة</h2></div>
              <p className="muted">{sent?.sentTo ? <>أرسلنا رمزاً إلى <b className="ltr" style={{ display: 'inline-block', direction: 'ltr' }}>{sent.sentTo}</b></> : 'إن كان الحساب موجوداً فقد أرسلنا إليه رمزاً.'}</p>
              {DevCode()}
              <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
              {PasswordField({ id: 'rp1', label: 'كلمة المرور الجديدة', field: 'password', autoComplete: 'new-password' })}
              {PasswordField({ id: 'rp2', label: 'تأكيد كلمة المرور', field: 'confirm', autoComplete: 'new-password' })}
              <Err />
              <Submit>تعيين كلمة المرور والدخول</Submit>
              <div className="row between">
                <button type="button" className="btn ghost small" onClick={() => go('forgot')}>رجوع</button>
                {Resend({ action: sendForgot })}
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
