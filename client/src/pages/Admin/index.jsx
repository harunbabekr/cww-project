import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, X, Send, Plus, Languages, RefreshCw, Trash2, Users, BookA, Inbox, Film, LoaderCircle } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useFeatures } from '../../lib/features';
import { langName } from '../../lib/languages';
import { LanguageSelect, PageHeader, Empty } from '../../components/ui';

const TABS = [
  { id: 'dialects', label: 'مراجعة اللهجات', icon: BookA },
  { id: 'groups', label: 'قاموس الرطانات', icon: BookA },
  { id: 'tickets', label: 'رسائل المستخدمين', icon: Inbox },
  { id: 'videos', label: 'الفيديوهات والدبلجة', icon: Film },
  { id: 'users', label: 'المستخدمون', icon: Users, adminOnly: true },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('dialects');
  const [stats, setStats] = useState(null);
  const isStaff = ['admin', 'moderator'].includes(user.role);

  useEffect(() => { if (isStaff) api.get('/admin/stats').then((r) => setStats(r.data.stats)).catch(() => {}); }, [isStaff, tab]);
  if (!isStaff) return <Navigate to="/" replace />;

  const tabs = TABS.filter((t) => !t.adminOnly || user.role === 'admin');
  return (
    <>
      <PageHeader eyebrow="الإدارة" title="لوحة الإدارة" subtitle={user.role === 'admin' ? 'صلاحيات كاملة' : 'صلاحيات مشرف'} />
      {stats && (
        <div className="grid cols-3" style={{ marginBottom: 16 }}>
          <div className="card"><small className="muted">مستخدمون</small><h2>{stats.users}</h2></div>
          <div className="card"><small className="muted">اقتراحات لهجات بانتظار المراجعة</small><h2>{stats.pendingDialects}</h2></div>
          <div className="card"><small className="muted">رسائل مفتوحة</small><h2>{stats.openTickets}</h2></div>
        </div>
      )}
      <div className="chips" style={{ marginBottom: 16 }}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`chip${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}><Icon size={14} /> {label}</button>)}
      </div>
      {tab === 'dialects' && <DialectReview />}
      {tab === 'groups' && <Groups />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'videos' && <Videos />}
      {tab === 'users' && <UsersTab me={user} />}
    </>
  );
}

function DialectReview() {
  const [items, setItems] = useState([]);
  const [meaning, setMeaning] = useState({});
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/dialects/pending').then((r) => setItems(r.data.entries)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const review = async (id, status) => {
    try { await api.patch(`/dialects/${id}/review`, { status, standardMeaning: meaning[id] }); setItems((x) => x.filter((e) => e._id !== id)); }
    catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="card">
      {error && <div className="alert error">{error}</div>}
      {items.length === 0 ? <Empty icon={Check}>لا توجد اقتراحات بانتظار المراجعة</Empty> : items.map((e) => (
        <div key={e._id} className="contact-item" style={{ flexWrap: 'wrap' }}>
          <div className="info" style={{ minWidth: 220 }}>
            <strong>{e.word}</strong> <span className="tag" style={{ background: '#d9a441', padding: '1px 8px', borderRadius: 99, fontSize: '.75rem' }}>{e.dialect}</span>
            <small className="muted" style={{ display: 'block' }}>اقترحه {e.submittedBy?.name || '—'} · {langName(e.language)}</small>
            {e.examples?.[0] && <small className="muted">مثال: {e.examples[0]}</small>}
          </div>
          <input className="input" style={{ maxWidth: 260 }} defaultValue={e.standardMeaning} onChange={(ev) => setMeaning((m) => ({ ...m, [e._id]: ev.target.value }))} aria-label="المعنى" />
          <button className="btn small primary" onClick={() => review(e._id, 'approved')}><Check /> اعتماد</button>
          <button className="btn small ghost" onClick={() => review(e._id, 'rejected')}><X /> رفض</button>
        </div>
      ))}
    </div>
  );
}

const CAT = { tribal: 'لغة / رطانة', sudanese_arabic: 'لهجة عربية سودانية', other_arabic: 'لهجة عربية أخرى' };

function Groups() {
  const [groups, setGroups] = useState([]);
  const [f, setF] = useState({ name: '', nameEn: '', code: '', category: 'tribal', region: '' });
  const [bulk, setBulk] = useState({ dialect: '', text: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const load = useCallback(() => api.get('/dialects', { params: { all: 1 } }).then((r) => setGroups(r.data.dialects)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const addGroup = async (e) => {
    e.preventDefault(); setError('');
    try { await api.post('/dialects/groups', f); setF({ name: '', nameEn: '', code: '', category: 'tribal', region: '' }); load(); } catch (err) { setError(errMsg(err)); }
  };
  const toggle = async (g) => { if (g._id) { await api.patch(`/dialects/groups/${g._id}`, { active: !g.active }); load(); } };
  const doBulk = async () => {
    setBusy(true); setError(''); setResult(null);
    try { const { data } = await api.post('/dialects/bulk', bulk); setResult(data); setBulk((b) => ({ ...b, text: '' })); load(); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}
      <div className="card stack">
        <h2 style={{ fontSize: '1.1rem' }}>استيراد جماعي للمفردات</h2>
        <p className="muted" style={{ fontSize: '.88rem' }}>الصق مفردات من متحدثين أصليين، كل سطر: <b>الكلمة | المعنى بالعربية | تهجئات أخرى (اختياري)</b>. تُعتمد مباشرة. اجعل متحدثاً أصلياً يراجعها قبل الاعتماد الواسع.</p>
        <select className="select" value={bulk.dialect} onChange={(e) => setBulk((b) => ({ ...b, dialect: e.target.value }))}>
          <option value="">اختر المجموعة…</option>
          {groups.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
        </select>
        <textarea className="textarea ltr" style={{ minHeight: 140, direction: 'rtl' }} placeholder={'كلمة | معناها\nكلمة أخرى | معناها | تهجئة بديلة'} value={bulk.text} onChange={(e) => setBulk((b) => ({ ...b, text: e.target.value }))} />
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !bulk.dialect || !bulk.text.trim()} onClick={doBulk}>{busy ? <LoaderCircle className="spin" /> : <Plus />} استيراد</button>
        {result && <div className="alert info">أُضيف {result.added} · مكرر {result.skipped}{result.errors?.length ? ` · أخطاء: ${result.errors.join('، ')}` : ''}</div>}
      </div>

      <form className="card stack" onSubmit={addGroup}>
        <h2 style={{ fontSize: '1.1rem' }}>إضافة رطانة / لهجة جديدة</h2>
        <div className="grid cols-2">
          <input className="input" placeholder="الاسم بالعربية (مثال: القمر)" value={f.name} onChange={set('name')} required />
          <input className="input ltr" placeholder="الاسم بالإنجليزية (اختياري)" value={f.nameEn} onChange={set('nameEn')} />
          <select className="select" value={f.category} onChange={set('category')}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="input" placeholder="المنطقة (اختياري)" value={f.region} onChange={set('region')} />
        </div>
        <button className="btn" style={{ alignSelf: 'flex-start' }}><Plus /> إضافة</button>
      </form>

      <div className="card">
        {groups.map((g) => (
          <div key={g.name} className="contact-item">
            <div className="info"><strong>{g.name}</strong> <small className="muted">{CAT[g.category]}{g.region ? ` · ${g.region}` : ''}</small></div>
            <span className="chip">{g.count} مصطلح</span>
            {g._id && <button className="btn small ghost" onClick={() => toggle(g)}>{g.active === false ? 'تفعيل' : 'تعطيل'}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tickets() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [reply, setReply] = useState({});
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/support/tickets', { params: { status: filter || undefined } }).then((r) => setItems(r.data.tickets)).catch((e) => setError(errMsg(e))), [filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, body) => {
    try { await api.patch(`/support/tickets/${id}`, body); setReply((r) => ({ ...r, [id]: '' })); load(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}
      <div className="chips">
        {[['', 'الكل'], ['open', 'مفتوحة'], ['in_progress', 'قيد المعالجة'], ['resolved', 'تم الحل']].map(([v, l]) => <button key={v} className={`chip${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      {items.length === 0 ? <div className="card"><Empty icon={Inbox}>لا توجد رسائل</Empty></div> : items.map((t) => (
        <div key={t._id} className="card stack">
          <div className="row between"><strong>{t.subject}</strong><span className={`status ${t.status}`}>{t.status}</span></div>
          <small className="muted">{t.name} · {t.email} · لغة الرسالة: {langName(t.language)}</small>
          <p>{t.messageAr || t.message}</p>
          {t.messageAr && t.language !== 'ar' && <details><summary className="muted">النص الأصلي</summary><p>{t.message}</p></details>}
          {t.reply && <div className="reply"><small>ردّك (يصل المستخدم بلغته)</small><p>{t.reply}</p></div>}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="اكتب ردك بالعربية — يُترجم تلقائياً" value={reply[t._id] || ''} onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))} />
            <button className="btn small primary" disabled={!reply[t._id]?.trim()} onClick={() => act(t._id, { reply: reply[t._id] })}><Send /> رد</button>
            <button className="btn small ghost" onClick={() => act(t._id, { status: 'resolved' })}><Check /> تم الحل</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Videos() {
  const features = useFeatures();
  const [videos, setVideos] = useState([]);
  const [open, setOpen] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [lang, setLang] = useState('ar');
  const [f, setF] = useState({ title: '', videoUrl: '', thumbnailUrl: '', originalLanguage: 'en', category: 'lecture', description: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const load = useCallback(() => api.get('/watch').then((r) => setVideos(r.data.videos)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const loadJobs = useCallback((id) => api.get(`/watch/${id}/jobs`).then((r) => setJobs(r.data.jobs)).catch(() => {}), []);
  useEffect(() => {
    if (!open) return undefined;
    loadJobs(open);
    const t = setInterval(() => { loadJobs(open); load(); }, 5000);
    return () => clearInterval(t);
  }, [open, loadJobs, load]);

  const add = async (e) => {
    e.preventDefault(); setError('');
    try { await api.post('/watch', f); setF((x) => ({ ...x, title: '', videoUrl: '', thumbnailUrl: '', description: '' })); load(); } catch (err) { setError(errMsg(err)); }
  };
  const dub = async (id) => {
    setError(''); setInfo('');
    try { await api.post(`/watch/${id}/dub`, { language: lang }); setInfo('بدأت المعالجة، قد تستغرق دقائق حسب طول الفيديو.'); loadJobs(id); } catch (err) { setError(errMsg(err)); }
  };
  const remove = async (id) => { if (confirm('حذف الفيديو؟')) { await api.delete(`/watch/${id}`); load(); } };

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert info">{info}</div>}
      {!features.dubbing && <div className="alert info">الدبلجة التلقائية غير مفعّلة: تحتاج GROQ_API_KEY وحزمة ffmpeg-static (تُثبَّت مع npm install). يمكنك إضافة الفيديوهات مع ذلك.</div>}

      <form className="card stack" onSubmit={add}>
        <h2 style={{ fontSize: '1.1rem' }}>إضافة فيديو</h2>
        <p className="muted" style={{ fontSize: '.85rem' }}>أضف محتوى تملك حقوقه أو برخصة مفتوحة (محاضراتك، محتوى Creative Commons). الرابط يجب أن يكون ملف فيديو مباشراً (mp4/webm) وليس رابط يوتيوب.</p>
        <input className="input" placeholder="العنوان" value={f.title} onChange={set('title')} required />
        <input className="input ltr" placeholder="رابط الفيديو المباشر https://…/video.mp4" value={f.videoUrl} onChange={set('videoUrl')} required />
        <input className="input ltr" placeholder="رابط الصورة المصغرة (اختياري)" value={f.thumbnailUrl} onChange={set('thumbnailUrl')} />
        <div className="grid cols-2">
          <LanguageSelect id="vl" label="لغة الفيديو الأصلية" value={f.originalLanguage} onChange={(v) => setF((x) => ({ ...x, originalLanguage: v }))} />
          <div className="field"><label htmlFor="vc">التصنيف</label>
            <select id="vc" className="select" value={f.category} onChange={set('category')}>
              <option value="lecture">محاضرة</option><option value="movie">فيلم</option><option value="series">مسلسل</option><option value="other">أخرى</option>
            </select></div>
        </div>
        <textarea className="textarea" style={{ minHeight: 70 }} placeholder="وصف (اختياري)" value={f.description} onChange={set('description')} />
        <button className="btn primary" style={{ alignSelf: 'flex-start' }}><Plus /> إضافة</button>
      </form>

      <div className="card">
        {videos.length === 0 ? <Empty icon={Film}>لا توجد فيديوهات</Empty> : videos.map((v) => (
          <div key={v._id} className="ticket">
            <div className="row between" style={{ flexWrap: 'wrap' }}>
              <div><strong>{v.title}</strong><small className="muted" style={{ display: 'block' }}>{langName(v.originalLanguage)} · لغات جاهزة: {v.languages?.length ? v.languages.map(langName).join('، ') : 'لا شيء'}</small></div>
              <div className="row">
                <button className="btn small ghost" onClick={() => setOpen(open === v._id ? null : v._id)}><Languages /> دبلجة/ترجمة</button>
                <button className="btn small ghost" onClick={() => remove(v._id)} aria-label="حذف"><Trash2 /></button>
              </div>
            </div>
            {open === v._id && (
              <div className="card stack" style={{ marginTop: 10 }}>
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <LanguageSelect id="dl2" label="لغة الدبلجة المطلوبة" value={lang} onChange={setLang} />
                  <button className="btn primary" disabled={!features.dubbing} onClick={() => dub(v._id)}><RefreshCw /> بدء المعالجة</button>
                </div>
                {jobs.map((j) => (
                  <div key={j.language} className="row" style={{ gap: 8 }}>
                    <b>{langName(j.language)}</b>
                    {j.status === 'processing' && <span className="chip"><LoaderCircle size={14} className="spin" /> {j.step || 'جارٍ'}</span>}
                    {j.status === 'done' && <span className="chip" style={{ color: '#17635d' }}>جاهز ✓</span>}
                    {j.status === 'failed' && <span className="alert error" style={{ padding: '4px 10px' }}>فشل: {j.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab({ me }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/admin/users', { params: { q: q || undefined } }).then((r) => setUsers(r.data.users)).catch((e) => setError(errMsg(e))), [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const patch = async (id, body) => { try { await api.patch(`/admin/users/${id}`, body); load(); } catch (e) { setError(errMsg(e)); } };

  return (
    <div className="card stack">
      {error && <div className="alert error">{error}</div>}
      <input className="input" placeholder="ابحث بالاسم أو البريد أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
      {users.map((u) => (
        <div key={u._id} className="contact-item" style={{ flexWrap: 'wrap' }}>
          <div className="info"><strong>{u.name}</strong><small className="muted ltr" style={{ display: 'block', direction: 'ltr' }}>{u.email} · {u.fullPhone}</small></div>
          <select className="select" style={{ width: 130 }} value={u.role} disabled={u._id === me.id} onChange={(e) => patch(u._id, { role: e.target.value })}>
            <option value="user">مستخدم</option><option value="moderator">مشرف</option><option value="admin">مدير</option>
          </select>
          <button className={`btn small ${u.isActive ? 'ghost' : 'danger'}`} disabled={u._id === me.id} onClick={() => patch(u._id, { isActive: !u.isActive })}>{u.isActive ? 'تعطيل' : 'تفعيل'}</button>
        </div>
      ))}
    </div>
  );
}
