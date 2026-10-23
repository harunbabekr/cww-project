import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, X, Send, Plus, Languages, RefreshCw, Trash2, Users, BookA, Inbox, Film, LoaderCircle } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useFeatures } from '../../lib/features';
import { langName } from '../../lib/languages';
import { LanguageSelect, PageHeader, Empty, ConfirmButton } from '../../components/ui';
import { DialectReview, EntriesManager, Groups } from './DialectAdmin';

const TABS = [
  { id: 'dialects', label: 'مراجعة الاقتراحات', icon: Check },
  { id: 'entries', label: 'المصطلحات', icon: BookA },
  { id: 'groups', label: 'الرطانات واللهجات', icon: Languages },
  { id: 'tickets', label: 'رسائل المستخدمين', icon: Inbox },
  { id: 'videos', label: 'الفيديوهات والدبلجة', icon: Film },
  { id: 'users', label: 'المستخدمون', icon: Users, adminOnly: true },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('dialects');
  const [entryFilter, setEntryFilter] = useState({});
  const [stats, setStats] = useState(null);
  const isStaff = ['admin', 'moderator'].includes(user.role);

  useEffect(() => { if (isStaff) api.get('/admin/stats').then((r) => setStats(r.data.stats)).catch(() => {}); }, [isStaff, tab]);
  if (!isStaff) return <Navigate to="/" replace />;

  const tabs = TABS.filter((t) => !t.adminOnly || user.role === 'admin');
  return (
    <>
      <PageHeader eyebrow="الإدارة" title="لوحة الإدارة" subtitle={user.role === 'admin' ? 'صلاحيات كاملة' : 'صلاحيات مشرف'} />
      {stats && (
        <div className="stats">
          <div className="card"><small className="muted">مستخدمون</small><h2>{stats.users}</h2></div>
          <div className="card"><small className="muted">اقتراحات معلّقة</small><h2>{stats.pendingDialects}</h2></div>
          <div className="card"><small className="muted">رسائل مفتوحة</small><h2>{stats.openTickets}</h2></div>
        </div>
      )}
      <div className="chips scroll" style={{ marginBottom: 16 }}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`chip${tab === id ? ' active' : ''}`} onClick={() => { if (id === 'entries') setEntryFilter({}); setTab(id); }}><Icon size={14} /> {label}</button>)}
      </div>
      {tab === 'dialects' && <DialectReview />}
      {tab === 'entries' && <EntriesManager key={entryFilter.dialect || 'all'} initial={entryFilter} />}
      {tab === 'groups' && <Groups me={user} onOpenEntries={(d) => { setEntryFilter({ dialect: d }); setTab('entries'); }} />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'videos' && <Videos />}
      {tab === 'users' && <UsersTab me={user} />}
    </>
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
            <input className="input" style={{ flex: 1, minWidth: 'min(200px, 100%)' }} placeholder="اكتب ردك بالعربية — يُترجم تلقائياً" value={reply[t._id] || ''} onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))} />
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
  const remove = async (id) => { try { await api.delete(`/watch/${id}`); load(); } catch (e) { setError(errMsg(e)); } };

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
                <ConfirmButton className="btn icon small ghost danger" confirmLabel="تأكيد" ariaLabel="حذف" onConfirm={() => remove(v._id)}><Trash2 /></ConfirmButton>
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
