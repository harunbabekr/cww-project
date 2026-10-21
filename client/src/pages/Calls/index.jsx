import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, UserPlus, Trash2, Users, LoaderCircle, MessageCircle, PhoneIncoming, PhoneOutgoing, PhoneMissed, PencilLine, Link2, Check, Ellipsis } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { useRoom } from '../../context/RoomContext';
import { langName } from '../../lib/languages';
import { Avatar, Empty, PageHeader } from '../../components/ui';
import AddContact from '../../components/AddContact';

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
const fmtWhen = (d) => new Date(d).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Calls() {
  const { user } = useAuth();
  const call = useCall();
  const room = useRoom();
  const navigate = useNavigate();
  const idle = call.status === 'idle' && room.status === 'idle';

  const [tab, setTab] = useState('contacts');
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [groupMode, setGroupMode] = useState(false);
  const [sel, setSel] = useState([]);
  const [number, setNumber] = useState('');
  const [dialBusy, setDialBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);

  const load = useCallback(async () => {
    try { setContacts((await api.get('/contacts')).data.contacts); }
    catch (e) { setMsg(errMsg(e)); } finally { setLoading(false); }
  }, []);
  const loadHistory = useCallback(async () => {
    try { setHistory((await api.get('/calls/history')).data.calls); } catch { /* غير حرج */ }
  }, []);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);
  // تحديث حالة الاتصال (أونلاين) دورياً، وإعادة تحميل السجل بعد كل مكالمة
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (idle) loadHistory(); }, [idle, loadHistory]);

  const remove = async (id) => { await api.delete(`/contacts/${id}`); setContacts((c) => c.filter((x) => x.id !== id)); };
  const rename = async (c, nickname) => {
    try { await api.patch(`/contacts/${c.id}`, { nickname }); setEditing(null); load(); } catch (e) { setMsg(errMsg(e)); }
  };

  const openChat = async (userId) => {
    try { const { data } = await api.post('/conversations', { userId }); navigate('/chat', { state: { open: data.conversation.id } }); } catch (e) { setMsg(errMsg(e)); }
  };

  // اتصال برقم مباشرة دون إضافة جهة اتصال أولاً
  const dial = async (video) => {
    setMsg(''); setMissing(false); setDialBusy(true);
    try {
      const { data } = await api.get('/users/search', { params: { q: number } });
      if (!data.user) { setMissing(true); return; }
      load();
      call.startCall({ id: data.user.id, name: data.user.name, phone: data.user.phone }, video);
    } catch (e) { setMsg(errMsg(e)); } finally { setDialBusy(false); }
  };

  const startGroup = (video) => { room.startRoom(sel, video); setGroupMode(false); setSel([]); };
  const toggleSel = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const max = 5;

  const inviteWhatsApp = async () => {
    try {
      const { data } = await api.get('/users/me/invite');
      const url = `${window.location.origin}/invite/${data.code}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(`${user.name} يدعوك إلى CWW — تكلّم وافهم جميع لغات العالم:\n${url}`)}`, '_blank');
    } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <>
      <PageHeader eyebrow="مكالمات" title="مكالمات صوت وفيديو" subtitle="تُترجم المكالمة تلقائياً إلى لغة كل طرف.">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={!idle || contacts.length < 2} onClick={() => { setGroupMode((g) => !g); setSel([]); }}><Users /> مكالمة جماعية</button>
          <button className="btn primary" onClick={() => setAdding(true)}><UserPlus /> إضافة جهة اتصال</button>
        </div>
      </PageHeader>

      {(msg || call.error) && <div className="alert error" style={{ marginBottom: 16 }}>{msg || call.error}</div>}

      <div className="card stack" style={{ marginBottom: 16 }}>
        <strong>اتصل برقم مباشرة</strong>
        <div className="row">
          <input className="input ltr" inputMode="tel" placeholder="0912345678" value={number} onChange={(e) => { setNumber(e.target.value); setMissing(false); }} />
          <button className="btn icon ghost" disabled={!idle || dialBusy || number.trim().length < 6} onClick={() => dial(false)} aria-label="صوتية">{dialBusy ? <LoaderCircle className="spin" /> : <Phone />}</button>
          <button className="btn icon primary" disabled={!idle || dialBusy || number.trim().length < 6} onClick={() => dial(true)} aria-label="فيديو"><Video /></button>
        </div>
        {missing && (
          <div className="alert info row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span>هذا الرقم غير مسجّل في CWW بعد.</span>
            <button className="btn small" onClick={inviteWhatsApp}><Link2 /> دعوته عبر واتساب</button>
          </div>
        )}
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}>جهات الاتصال</button>
        <button type="button" className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>الأخيرة{history.some((h) => h.missed) ? ' •' : ''}</button>
      </div>

      {tab === 'contacts' && (
        <div className="card">
          {groupMode && (
            <div className="alert info row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <span>اختر من 2 إلى {max} أشخاص ({sel.length})</span>
              <span className="row">
                <button className="btn small" disabled={sel.length < 2 || sel.length > max} onClick={() => startGroup(false)}><Phone /> صوتية</button>
                <button className="btn small primary" disabled={sel.length < 2 || sel.length > max} onClick={() => startGroup(true)}><Video /> فيديو</button>
              </span>
            </div>
          )}
          {loading ? <Empty icon={LoaderCircle}>جارٍ التحميل…</Empty>
            : contacts.length === 0 ? (
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: 16 }}>
                <Users size={36} />
                <strong>لا توجد جهات اتصال بعد</strong>
                <p className="muted">ادعُ أصدقاءك برابط أو واتساب، أو ابحث عنهم برقم هاتفهم المحلي أو باسمهم.</p>
                <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => setAdding(true)}><UserPlus /> إضافة جهة اتصال</button>
                  <button className="btn" onClick={inviteWhatsApp}><Link2 /> دعوة عبر واتساب</button>
                </div>
              </div>
            ) : contacts.map((c) => (
              <div key={c.id} className="contact-item">
                {groupMode && <input type="checkbox" checked={sel.includes(c.user.id)} onChange={() => toggleSel(c.user.id)} aria-label="تحديد" />}
                <span className="avatar-wrap"><Avatar name={c.nickname || c.user.name} />{c.user.online && <i className="dot online" title="متصل الآن" />}</span>
                <div className="info">
                  {editing === c.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); rename(c, e.target.nick.value); }} className="row">
                      <input name="nick" className="input" defaultValue={c.nickname || ''} placeholder={c.user.name} maxLength={60} autoFocus />
                      <button className="btn small primary"><Check /></button>
                    </form>
                  ) : (
                    <>
                      <strong>{c.nickname || c.user.name}</strong>
                      <small className="muted ltr" style={{ display: 'inline-block' }}>{c.user.phone}</small>
                      {c.user.settings?.speakLanguage && <span className="chip" style={{ marginInlineStart: 8 }}>{langName(c.user.settings.speakLanguage)}</span>}
                    </>
                  )}
                </div>
                {!groupMode && (
                  <div className="actions">
                    <button className="btn icon ghost" onClick={() => openChat(c.user.id)} aria-label="مراسلة"><MessageCircle /></button>
                    <button className="btn icon ghost" disabled={!idle} onClick={() => call.startCall(c.user, false)} aria-label="مكالمة صوتية"><Phone /></button>
                    <button className="btn icon primary" disabled={!idle} onClick={() => call.startCall(c.user, true)} aria-label="مكالمة فيديو"><Video /></button>
                    <button className="btn icon ghost" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label="المزيد" aria-expanded={menu === c.id}><Ellipsis /></button>
                  </div>
                )}
                {!groupMode && menu === c.id && (
                  <div className="contact-menu">
                    <button className="btn small ghost" onClick={() => { setEditing(c.id); setMenu(null); }}><PencilLine /> تعديل الاسم</button>
                    <button className="btn small ghost danger" onClick={() => { setMenu(null); remove(c.id); }}><Trash2 /> حذف</button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {tab === 'recent' && (
        <div className="card">
          {history.length === 0 ? <Empty icon={Phone}>لا توجد مكالمات بعد</Empty> : (
            <>
              {history.map((h) => {
                const Icon = h.missed ? PhoneMissed : h.direction === 'outgoing' ? PhoneOutgoing : PhoneIncoming;
                const title = h.kind === 'group' ? `مكالمة جماعية (${(h.members?.length || 0) + 1})` : h.peer?.name || 'مستخدم';
                const sub = h.kind === 'group' ? h.members?.map((m) => m.name).join('، ') : h.peer?.phone;
                return (
                  <div key={h.id} className="contact-item">
                    <Icon size={20} color={h.missed ? '#c0392b' : undefined} />
                    <div className="info">
                      <strong style={{ color: h.missed ? '#c0392b' : undefined }}>{title}</strong>
                      <small className="muted" style={{ display: 'block' }}>{sub && <span className="ltr" style={{ direction: 'ltr', display: 'inline-block', marginInlineEnd: 8 }}>{sub}</span>}{fmtWhen(h.startedAt)}{h.duration ? ` · ${fmtDur(h.duration)}` : ''}{h.video ? ' · فيديو' : ''}</small>
                    </div>
                    {h.peer && <button className="btn icon ghost" disabled={!idle} onClick={() => call.startCall(h.peer, h.video)} aria-label="معاودة الاتصال"><Phone /></button>}
                  </div>
                );
              })}
              <button className="btn small ghost" style={{ marginTop: 8 }} onClick={async () => { await api.delete('/calls/history'); setHistory([]); }}><Trash2 /> مسح السجل</button>
            </>
          )}
        </div>
      )}

      {adding && <AddContact onClose={() => setAdding(false)} onChanged={load} />}
    </>
  );
}
