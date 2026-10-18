import { useEffect, useState } from 'react';
import { Search, UserPlus, Check, Link2, Copy, Share2, MessageCircle, Smartphone, LoaderCircle, QrCode } from 'lucide-react';
import api, { errMsg } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';

const contactsApi = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
const inviteUrl = (code) => `${window.location.origin}/invite/${code}`;
const inviteText = (name, url) => `${name} يدعوك للانضمام إلى CWW — تطبيق الترجمة الفورية: تكلّم وافهم جميع لغات العالم بلغتك.\n${url}`;

/**
 * نافذة إضافة جهات الاتصال — ثلاث طرق (لأن البحث برقم كامل وحده لا يكفي):
 *  1) بحث برقم (محلي 09xxxxxxxx أو دولي) أو بريد أو اسم
 *  2) دعوة صديق غير مسجّل برابط/واتساب/QR — يُضافان لبعضهما تلقائياً عند التسجيل
 *  3) استيراد من جهات الهاتف (Android Chrome) ومطابقتها مع المسجّلين
 */
export default function AddContact({ onClose, onChanged }) {
  const [tab, setTab] = useState('search');
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>إضافة جهة اتصال</h2>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button type="button" className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>بحث</button>
          <button type="button" className={tab === 'invite' ? 'active' : ''} onClick={() => setTab('invite')}>دعوة</button>
          <button type="button" className={tab === 'phone' ? 'active' : ''} onClick={() => setTab('phone')}>جهات هاتفي</button>
        </div>
        {tab === 'search' && <SearchTab onChanged={onChanged} goInvite={() => setTab('invite')} />}
        {tab === 'invite' && <InviteTab />}
        {tab === 'phone' && <PhoneTab onChanged={onChanged} goInvite={() => setTab('invite')} />}
        <button className="btn ghost" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

function ResultRow({ u, onChanged }) {
  const [done, setDone] = useState(!!u.isContact);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => {
    setBusy(true); setErr('');
    try { await api.post('/contacts', { userId: u.id }); setDone(true); onChanged?.(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="contact-item">
        <Avatar name={u.name} />
        <div className="info"><strong>{u.name}</strong><small className="muted ltr" style={{ display: 'inline-block' }}>{u.phone}</small></div>
        {done ? <span className="chip"><Check size={14} /> مضاف</span> : <button className="btn small primary" disabled={busy} onClick={add}>{busy ? <LoaderCircle className="spin" /> : <UserPlus />} إضافة</button>}
      </div>
      {err && <div className="alert error">{err}</div>}
    </div>
  );
}

function SearchTab({ onChanged, goInvite }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const search = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { setUsers((await api.get('/users/search', { params: { q } })).data.users); }
    catch (x) { setErr(errMsg(x)); setUsers(null); } finally { setBusy(false); }
  };

  return (
    <>
      <form className="row" onSubmit={search}>
        <input className="input" placeholder="رقم الهاتف (0912345678) أو البريد أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} autoFocus inputMode="search" />
        <button className="btn" disabled={busy || q.trim().length < 2} aria-label="بحث">{busy ? <LoaderCircle className="spin" /> : <Search />}</button>
      </form>
      <small className="muted">يقبل الرقم المحلي (مثل 0912345678) أو الدولي (+249912345678).</small>
      {err && <div className="alert error">{err}</div>}
      {users && users.length === 0 && (
        <div className="alert info stack" style={{ gap: 8 }}>
          <span>لا يوجد مستخدم بهذه البيانات على CWW بعد. ادعُه ليسجّل وسيُضاف إلى جهاتك تلقائياً.</span>
          <button className="btn small" onClick={goInvite}><Link2 /> إرسال رابط دعوة</button>
        </div>
      )}
      {users?.map((u) => <ResultRow key={u.id} u={u} onChanged={onChanged} />)}
    </>
  );
}

function InviteTab() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/users/me/invite').then((r) => setUrl(inviteUrl(r.data.code))).catch((e) => setErr(errMsg(e)));
  }, []);
  useEffect(() => {
    if (!url) return;
    import('qrcode').then((m) => (m.default || m).toDataURL(url, { margin: 1, width: 220 })).then(setQr).catch(() => {});
  }, [url]);

  const text = inviteText(user.name, url);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr('تعذّر النسخ'); } };
  const share = () => (navigator.share ? navigator.share({ title: 'CWW', text, url }).catch(() => {}) : copy());

  return (
    <>
      <p className="muted">أرسل هذا الرابط لأي شخص. عند تسجيله (أو دخوله) تُضاف أنت وهو إلى جهات بعضكما تلقائياً.</p>
      {err && <div className="alert error">{err}</div>}
      <input className="input ltr" readOnly value={url} onFocus={(e) => e.target.select()} />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn small" disabled={!url} onClick={copy}><Copy /> {copied ? 'تم النسخ' : 'نسخ'}</button>
        <button className="btn small" disabled={!url} onClick={share}><Share2 /> مشاركة</button>
        <a className="btn small primary" aria-disabled={!url} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب</a>
      </div>
      {qr && (
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <img src={qr} alt="رمز QR لرابط الدعوة" width={180} height={180} style={{ borderRadius: 12, background: '#fff' }} />
          <small className="muted"><QrCode size={14} /> دعه يمسح الرمز بكاميرا هاتفه</small>
        </div>
      )}
    </>
  );
}

function PhoneTab({ onChanged, goInvite }) {
  const [state, setState] = useState('idle'); // idle | loading | done
  const [found, setFound] = useState([]);
  const [rest, setRest] = useState([]); // غير مسجلين: { name, tel }
  const [err, setErr] = useState('');
  const [added, setAdded] = useState(false);

  if (!contactsApi) {
    return (
      <div className="alert info stack" style={{ gap: 8 }}>
        <span>استيراد جهات الهاتف يعمل على متصفح Chrome في أندرويد فقط. يمكنك بدلاً من ذلك البحث بالرقم أو إرسال رابط دعوة.</span>
        <button className="btn small" onClick={goInvite}><Link2 /> رابط الدعوة</button>
      </div>
    );
  }

  const pick = async () => {
    setErr(''); setState('loading');
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      const phones = []; const owners = new Map();
      for (const c of picked) for (const t of c.tel || []) { phones.push(t); owners.set(t, c.name?.[0] || t); }
      if (!phones.length) { setState('idle'); return; }
      const { data } = await api.post('/contacts/match', { phones });
      setFound(data.users);
      const matched = new Set(data.users.map((u) => u.phone.replace(/\D/g, '').slice(-8)));
      setRest([...owners].filter(([t]) => !matched.has(t.replace(/\D/g, '').slice(-8))).map(([tel, name]) => ({ tel, name })).slice(0, 30));
      setState('done');
    } catch (e) { if (e?.name !== 'AbortError') setErr(errMsg(e)); setState('idle'); }
  };

  const addAll = async () => {
    try { await api.post('/contacts/bulk', { userIds: found.filter((u) => !u.isContact).map((u) => u.id) }); setAdded(true); onChanged?.(); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <>
      <p className="muted">اختر جهات من هاتفك ونُطابقها مع المسجّلين في CWW. لا نحتفظ بأرقامك ولا بأسماء جهاتك.</p>
      <button className="btn" onClick={pick} disabled={state === 'loading'}>{state === 'loading' ? <LoaderCircle className="spin" /> : <Smartphone />} اختيار من جهات الهاتف</button>
      {err && <div className="alert error">{err}</div>}
      {state === 'done' && (
        <>
          {found.length === 0 ? <div className="alert info">لا أحد من الجهات المختارة مسجّل في CWW بعد.</div> : (
            <>
              <div className="row between"><strong>مسجّلون في CWW ({found.length})</strong><button className="btn small primary" onClick={addAll} disabled={added || found.every((u) => u.isContact)}>{added ? 'تمت الإضافة' : 'إضافة الكل'}</button></div>
              {found.map((u) => <ResultRow key={u.id} u={u} onChanged={onChanged} />)}
            </>
          )}
          {rest.length > 0 && (
            <>
              <strong style={{ marginTop: 8 }}>ادعُ من لم يسجّل بعد</strong>
              {rest.map((r) => <InviteRow key={r.tel} r={r} />)}
            </>
          )}
        </>
      )}
    </>
  );
}

function InviteRow({ r }) {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  useEffect(() => { api.get('/users/me/invite').then((x) => setCode(x.data.code)).catch(() => {}); }, []);
  const digits = r.tel.replace(/[^\d]/g, '').replace(/^0+/, (z) => (z.length === 1 ? '249' : ''));
  const text = encodeURIComponent(inviteText(user.name, code ? inviteUrl(code) : window.location.origin));
  return (
    <div className="contact-item">
      <Avatar name={r.name} />
      <div className="info"><strong>{r.name}</strong><small className="muted ltr" style={{ display: 'inline-block' }}>{r.tel}</small></div>
      <a className="btn small ghost" aria-disabled={!code} href={`https://wa.me/${digits}?text=${text}`} target="_blank" rel="noreferrer"><MessageCircle /> دعوة</a>
    </div>
  );
}
