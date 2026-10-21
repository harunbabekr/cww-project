import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, LogOut, Mic, Square, Trash2, Bell, BellOff, Download, ShieldAlert, Share } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api, { errMsg } from '../../services/api';
import { useFeatures } from '../../lib/features';
import { useInstall } from '../../lib/pwa';
import { enablePush, disablePush, pushEnabled, pushSupported } from '../../lib/push';
import { getMic, recordClip, recordingSupported } from '../../lib/recorder';
import { LanguageSelect, Toggle, PageHeader } from '../../components/ui';
import AddContact from '../../components/AddContact';
import { SECONDARY, ADMIN, isStaff } from '../../components/layout/nav';

export default function Settings() {
  const { user, updateSettings, refresh, logout } = useAuth();
  const features = useFeatures();
  const install = useInstall();
  const [f, setF] = useState({ name: user.name, discoverable: user.discoverable !== false, ...user.settings });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await updateSettings({ name: f.name, speakLanguage: f.speakLanguage, targetLanguage: f.targetLanguage, autoDetect: f.autoDetect, discoverable: f.discoverable, translationStyle: f.translationStyle, voiceClone: f.voiceClone });
      setMsg({ ok: true, text: 'تم حفظ الإعدادات' });
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="الإعدادات" title="إعدادات التطبيق" subtitle="تتحكم هذه الخيارات في لغات الترجمة والصوت والإشعارات." />
      <div className="card more-card only-compact">
        <h2 style={{ fontSize: '1.1rem' }}>المزيد من CWW</h2>
        {[...SECONDARY, ...(isStaff(user) ? [ADMIN] : [])].map(({ path, name, text, icon: Icon }) => (
          <Link key={path} to={path} className="more-item">
            <span className="more-ico"><Icon /></span>
            <span className="info"><strong>{name}</strong><small className="muted">{text}</small></span>
          </Link>
        ))}
      </div>
      <div className="grid cols-2">
        <div className="card stack">
          <h2 style={{ fontSize: '1.1rem' }}>الحساب واللغات</h2>
          <div className="field"><label htmlFor="nm">اسم المستخدم</label><input id="nm" className="input" value={f.name} onChange={(e) => set('name')(e.target.value)} /></div>
          <div className="field"><label>رقم الهاتف</label><input className="input ltr" value={user.phone} disabled /></div>
          <LanguageSelect id="sp" label="لغة المتكلم (لغتي — بها أكتب وأقرأ الرسائل)" value={f.speakLanguage} onChange={set('speakLanguage')} />
          <LanguageSelect id="tg" label="لغة المتكلم الآخر (الافتراضية)" value={f.targetLanguage} onChange={set('targetLanguage')} />
          <div className="field">
            <label htmlFor="ts">أسلوب الترجمة إلى العربية</label>
            <select id="ts" className="select" value={f.translationStyle} onChange={(e) => set('translationStyle')(e.target.value)}>
              <option value="colloquial">عامية سودانية (طبيعية كما يتكلم الناس)</option>
              <option value="standard">فصحى مبسّطة</option>
            </select>
          </div>
          <Toggle label="تحديد لغة المتكلم الآخر تلقائياً" hint="يخمّن لغة المتكلم الآخر فقط (ضمن لغات مرجّحة) ويقترح عليك تعيينها، ولا يغيّر لغتك أبداً. يُنصح بتركه مغلقاً إن كنت تعرف لغته." checked={f.autoDetect} onChange={set('autoDetect')} />
          <Toggle label="السماح بالعثور عليّ بالاسم" hint="عند الإيقاف لا يظهر اسمك في بحث الأسماء، ويبقى بإمكان من يعرف رقمك أو بريدك إضافتك." checked={f.discoverable} onChange={set('discoverable')} />
          {msg && <div className={`alert ${msg.ok ? 'info' : 'error'}`}>{msg.text}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={save}><Save /> حفظ</button>
            <button className="btn ghost" onClick={logout}><LogOut /> تسجيل الخروج</button>
          </div>
        </div>

        <div className="stack">
          <InviteCard />
          <VoiceClone user={user} features={features} f={f} set={set} refresh={refresh} />
          <ChangePassword />
          <Notifications features={features} />
          <div className="card stack">
            <h2 style={{ fontSize: '1.1rem' }}>تثبيت التطبيق</h2>
            {install.installed ? <p className="muted">التطبيق مثبّت على جهازك ✓</p>
              : install.canPrompt ? <button className="btn" onClick={install.install}><Download /> تثبيت CWW</button>
              : install.iosHint ? <p className="muted"><Share size={14} /> في Safari: زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</p>
              : <p className="muted">افتح التطبيق في Chrome أو Edge (وبرابط https) ليظهر خيار التثبيت.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function ChangePassword() {
  const { changePassword } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) return setMsg({ ok: false, text: 'كلمتا المرور غير متطابقتين' });
    setBusy(true); setMsg(null);
    try {
      await changePassword(f.current, f.next);
      setF({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: 'تم تغيير كلمة المرور. أُغلقت الجلسات على الأجهزة الأخرى.' });
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 style={{ fontSize: '1.1rem' }}>تغيير كلمة المرور</h2>
      <input type="password" className="input ltr" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={f.current} onChange={set('current')} required />
      <input type="password" className="input ltr" autoComplete="new-password" placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)" value={f.next} onChange={set('next')} required minLength={8} />
      <input type="password" className="input ltr" autoComplete="new-password" placeholder="تأكيد كلمة المرور الجديدة" value={f.confirm} onChange={set('confirm')} required minLength={8} />
      {msg && <div className={`alert ${msg.ok ? 'info' : 'error'}`}>{msg.text}</div>}
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy}>حفظ كلمة المرور</button>
    </form>
  );
}

function Notifications({ features }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { pushEnabled().then(setOn).catch(() => {}); }, []);

  const toggle = async () => {
    setErr('');
    try { if (on) { await disablePush(); setOn(false); } else { await enablePush(); setOn(true); } }
    catch (e) { setErr(e.message || errMsg(e)); }
  };
  return (
    <div className="card stack">
      <h2 style={{ fontSize: '1.1rem' }}>الإشعارات</h2>
      <p className="muted">لتصلك المكالمات والرسائل حتى والتطبيق مغلق.</p>
      {!features.push && <div className="alert info">الإشعارات غير مفعّلة على الخادم (مفاتيح VAPID).</div>}
      {err && <div className="alert error">{err}</div>}
      <button className="btn" onClick={toggle} disabled={!features.push || !pushSupported()}>{on ? <><BellOff /> إيقاف الإشعارات</> : <><Bell /> تفعيل الإشعارات</>}</button>
    </div>
  );
}

function VoiceClone({ user, features, f, set, refresh }) {
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState('idle'); // idle | recording | uploading
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const clip = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);

  useEffect(() => { if (state === 'recording' && secs >= 90) stop(); }, [secs, state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  const stop = async () => {
    clearInterval(timer.current);
    const r = await clip.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (r.ms < 20000) { setState('idle'); return setErr('العينة قصيرة، سجّل 30 ثانية على الأقل (يُفضّل دقيقة).'); }
    setState('uploading');
    try {
      await api.post('/users/me/voice', r.blob, { headers: { 'Content-Type': r.mime, 'x-voice-consent': 'yes' }, transformRequest: [(d) => d] });
      await refresh();
      set('voiceClone')(true);
    } catch (e) { setErr(errMsg(e)); }
    setState('idle');
  };

  const start = async () => {
    setErr('');
    try {
      stream.current = await getMic();
      clip.current = recordClip(stream.current);
      setSecs(0); setState('recording');
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch { setErr('اسمح للمتصفح باستخدام الميكروفون'); }
  };

  const remove = async () => {
    try { await api.delete('/users/me/voice'); await refresh(); set('voiceClone')(false); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="card stack">
      <h2 style={{ fontSize: '1.1rem' }}>محاكاة الصوت</h2>
      <p className="muted">تُنطق ترجمتك للطرف الآخر بصوت يشبه صوتك. تتطلب موافقتك وعينة من صوتك.</p>
      {!features.voiceClone ? <div className="alert info">الميزة غير مفعّلة على الخادم (ELEVENLABS_API_KEY) وقد تتطلب خطة ElevenLabs مدفوعة.</div> : user.hasVoice ? (
        <>
          <Toggle label="استخدام صوتي في الترجمة" checked={f.voiceClone} onChange={set('voiceClone')} hint="اضغط «حفظ» في البطاقة الأخرى لتأكيد التغيير" />
          <button className="btn ghost" onClick={remove}><Trash2 /> حذف نسخة صوتي</button>
        </>
      ) : (
        <>
          <label className="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 6 }} />
            <span>أوافق صراحةً على استنساخ <b>صوتي أنا</b> فقط واستخدامه داخل التطبيق، وأعلم أنني أستطيع حذفه في أي وقت.</span>
          </label>
          {!recordingSupported() ? <div className="alert error">المتصفح لا يدعم التسجيل</div> : state === 'recording' ? (
            <button className="btn danger" onClick={stop}><Square /> إيقاف ({secs}ث) — اقرأ أي نص بصوت طبيعي</button>
          ) : (
            <button className="btn" disabled={!consent || state === 'uploading'} onClick={start}><Mic /> {state === 'uploading' ? 'جارٍ الرفع…' : 'تسجيل عينة صوتي (30–90 ثانية)'}</button>
          )}
        </>
      )}
      {err && <div className="alert error"><ShieldAlert size={14} /> {err}</div>}
    </div>
  );
}

function InviteCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card stack">
      <h2 style={{ fontSize: '1.1rem' }}>دعوة الأصدقاء</h2>
      <p className="muted">شارك رابطك أو رمز QR مع من تريد التواصل معه؛ يُضافان لبعضهما تلقائياً عند التسجيل.</p>
      <button className="btn" onClick={() => setOpen(true)}>رابط الدعوة وإضافة جهات</button>
      {open && <AddContact onClose={() => setOpen(false)} />}
    </div>
  );
}
