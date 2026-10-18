import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Plus, MessageCircle, Users, X, Volume2, Phone, Video, Mic, Square, UserPlus, LogOut, LoaderCircle } from 'lucide-react';
import { say } from '../../lib/audio';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { useRoom } from '../../context/RoomContext';
import { useFeatures } from '../../lib/features';
import { getMic, recordClip, recordingSupported, sendAudio } from '../../lib/recorder';
import { createRecognizer, browserSpeechSupported } from '../../lib/browserSpeech';
import api, { errMsg } from '../../services/api';
import { Avatar, Empty, PageHeader } from '../../components/ui';
import { LANGUAGES } from '../../lib/languages';
import AddContact from '../../components/AddContact';

export default function Chat() {
  const { user, socket } = useAuth();
  const call = useCall();
  const room = useRoom();
  const features = useFeatures();
  const location = useLocation();
  const myLang = user.settings.speakLanguage;

  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(location.state?.open || null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sendLang, setSendLang] = useState(myLang); // لغة الكتابة/الإرسال لهذه الجلسة
  const [typing, setTyping] = useState('');
  const [showOriginal, setShowOriginal] = useState({});
  const [picker, setPicker] = useState(false);
  const [members, setMembers] = useState(false);
  const [error, setError] = useState('');
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const activeRef = useRef(null);
  const clipRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);
  activeRef.current = activeId;
  const active = convs.find((c) => c.id === activeId);
  const idle = call.status === 'idle' && room.status === 'idle';
  const serverStt = features.stt?.available && recordingSupported();
  const canDictate = serverStt || browserSpeechSupported;

  const loadConvs = useCallback(async () => {
    try { setConvs((await api.get('/conversations')).data.conversations); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  useEffect(() => {
    if (!activeId || !socket) return undefined;
    setMessages([]); setTyping('');
    socket.emit('chat:join', activeId);
    api.get(`/conversations/${activeId}/messages`).then((r) => setMessages(r.data.messages)).catch((e) => setError(errMsg(e)));
    return () => socket.emit('chat:leave', activeId);
  }, [activeId, socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (m) => {
      if (m.conversation === activeRef.current) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setConvs((prev) => {
        if (!prev.some((c) => c.id === m.conversation)) { loadConvs(); return prev; } // محادثة جديدة بدأها شخص آخر
        return prev.map((c) => (c.id === m.conversation ? { ...c, lastMessage: m.originalText, lastMessageAt: m.createdAt } : c)).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      });
    };
    const onTyping = ({ conversationId, name, isTyping, userId }) => {
      if (conversationId !== activeRef.current || userId === user.id) return;
      setTyping(isTyping ? `${name} يكتب…` : '');
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    return () => { socket.off('chat:message', onMessage); socket.off('chat:typing', onTyping); };
  }, [socket, user.id, loadConvs]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => { recogRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const send = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || !activeId) return;
    setText('');
    socket.emit('chat:send', { conversationId: activeId, text: value, language: sendLang }, (res) => {
      if (!res?.ok) setError(res?.error || 'فشل الإرسال');
    });
  };

  const onType = (e) => {
    setText(e.target.value);
    socket?.emit('chat:typing', { conversationId: activeId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit('chat:typing', { conversationId: activeId, isTyping: false }), 1500);
  };

  // إملاء صوتي: تتكلم فيُكتب النص في خانة الرسالة (ثم ترسله مترجماً للجميع)
  const dictate = async () => {
    setError('');
    if (dictating) {
      setDictating(false);
      if (serverStt) {
        const r = await clipRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clipRef.current = null;
        if (r && r.ms > 500) {
          setTranscribing(true);
          try { const { data } = await sendAudio(api, '/translate/stt', r.blob, r.mime, { language: sendLang }); setText((t) => `${t} ${data.data.text}`.trim()); }
          catch (e) { setError(errMsg(e)); } finally { setTranscribing(false); }
        }
      } else recogRef.current?.stop();
      return;
    }
    if (serverStt) {
      try { streamRef.current = await getMic(); clipRef.current = recordClip(streamRef.current); setDictating(true); }
      catch { setError('اسمح للمتصفح باستخدام الميكروفون'); }
      return;
    }
    const rec = createRecognizer({
      lang: sendLang,
      onFinal: (t) => setText((x) => `${x} ${t}`.trim()),
      onError: (c) => setError(c === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : `خطأ في التعرف على الصوت: ${c}`),
      onEnd: () => setDictating(false),
    });
    recogRef.current = rec; setDictating(true); rec.start();
  };

  const others = active ? active.members.filter((m) => m.id !== user.id) : [];
  const callChat = (video) => {
    if (!active) return;
    if (!active.isGroup) call.startCall({ id: others[0].id, name: others[0].name, phone: others[0].phone }, video);
    else room.startRoom(others.slice(0, 5).map((m) => m.id), video);
  };

  const render = (m) => {
    const mine = m.sender === user.id;
    const translated = !mine ? m.translations?.[myLang] : null;
    const shown = translated || m.originalText;
    return (
      <div key={m.id} className={`bubble${mine ? ' mine' : ''}`}
        onClick={() => translated && setShowOriginal((s) => ({ ...s, [m.id]: !s[m.id] }))}
        style={{ cursor: translated ? 'pointer' : 'default' }}>
        {shown}
        {translated && showOriginal[m.id] && <span className="orig">{m.originalText}</span>}
        <button className="bubble-speak" onClick={(e) => { e.stopPropagation(); say({ text: shown, lang: translated ? myLang : m.sourceLanguage }); }} aria-label="نطق"><Volume2 size={14} /></button>
        <small>{new Date(m.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}{translated ? ' · مترجمة — اضغط لعرض الأصل' : ''}</small>
      </div>
    );
  };

  return (
    <>
      <PageHeader eyebrow="دردشة الرسائل" title="الرسائل" subtitle="تكتب بلغتك ويقرأ كل شخص بلغته." />
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error} <button onClick={() => setError('')} aria-label="إغلاق"><X size={14} /></button></div>}
      {call.error && <div className="alert error" style={{ marginBottom: 12 }}>{call.error}</div>}

      <div className="chat">
        <aside className="card chat-list">
          <div className="chat-list-head">
            <button className="btn primary" style={{ width: '100%' }} onClick={() => setPicker(true)}><Plus /> محادثة جديدة</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {convs.length === 0 && <Empty icon={MessageCircle}>لا توجد محادثات</Empty>}
            {convs.map((c) => (
              <button key={c.id} className={`conv-item${c.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(c.id)}>
                <Avatar name={c.name} />
                <div className="info"><strong>{c.name}</strong><small>{c.lastMessage || 'ابدأ المحادثة'}</small></div>
              </button>
            ))}
          </div>
        </aside>

        <section className="card chat-thread">
          {!active ? (
            <Empty icon={MessageCircle}>اختر محادثة أو ابدأ واحدة جديدة</Empty>
          ) : (
            <>
              <div className="thread-head row between">
                <div className="row">
                  <Avatar name={active.name} />
                  <div><strong>{active.name}</strong>{active.isGroup && <small className="muted" style={{ display: 'block' }}>{active.members.length} أعضاء</small>}</div>
                </div>
                <div className="row">
                  <button className="btn small ghost" disabled={!idle || !others.length} onClick={() => callChat(false)} aria-label="مكالمة صوتية"><Phone /></button>
                  <button className="btn small ghost" disabled={!idle || !others.length} onClick={() => callChat(true)} aria-label="مكالمة فيديو"><Video /></button>
                  {active.isGroup && <button className="btn small ghost" onClick={() => setMembers(true)} aria-label="الأعضاء"><Users /></button>}
                </div>
              </div>
              <div className="messages">{messages.map(render)}<div ref={endRef} /></div>
              <div className="typing">{typing}</div>
              <form className="composer" onSubmit={send}>
                <select className="select" style={{ width: 110, flex: '0 0 auto' }} value={sendLang} onChange={(e) => setSendLang(e.target.value)} aria-label="لغة الكتابة" title="لغة كتابتك">
                  <LangOptions />
                </select>
                <input className="input" value={text} onChange={onType} placeholder={dictating ? 'جارٍ الاستماع…' : 'اكتب رسالتك بلغتك…'} maxLength={4000} />
                {canDictate && (
                  <button type="button" className={`btn ghost${dictating ? ' off' : ''}`} onClick={dictate} disabled={transcribing} aria-label="إملاء صوتي">
                    {transcribing ? <LoaderCircle className="spin" /> : dictating ? <Square /> : <Mic />}
                  </button>
                )}
                <button className="btn primary" disabled={!text.trim()} aria-label="إرسال"><Send /></button>
              </form>
            </>
          )}
        </section>
      </div>

      {picker && <NewChat onClose={() => setPicker(false)} onCreated={(c) => {
        setConvs((p) => (p.some((x) => x.id === c.id) ? p : [c, ...p]));
        setActiveId(c.id);
        setPicker(false);
      }} />}
      {members && active && <GroupMembers conv={active} me={user.id} onClose={() => setMembers(false)} onUpdated={(c) => setConvs((p) => p.map((x) => (x.id === c.id ? c : x)))} onLeft={() => { setMembers(false); setActiveId(null); loadConvs(); }} />}
    </>
  );
}

function LangOptions() {
  return LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>);
}

function NewChat({ onClose, onCreated }) {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/contacts').then((r) => setContacts(r.data.contacts)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    try {
      const body = selected.length === 1 ? { userId: selected[0] } : { memberIds: selected, name };
      const { data } = await api.post('/conversations', body);
      onCreated(data.conversation);
    } catch (e) { setError(errMsg(e)); }
  };

  // مراسلة رقم مباشرة دون المرور بإضافة جهة اتصال
  const byNumber = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.get('/users/search', { params: { q: number } });
      if (!data.user) { setError('هذا الرقم/الاسم غير مسجّل في CWW. أرسل له رابط دعوة من «إضافة جهة اتصال».'); return; }
      const res = await api.post('/conversations', { userId: data.user.id });
      onCreated(res.data.conversation);
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>محادثة جديدة</h2>
        <form className="row" onSubmit={byNumber}>
          <input className="input" placeholder="راسل رقماً مباشرة: 0912345678" inputMode="search" value={number} onChange={(e) => setNumber(e.target.value)} />
          <button className="btn small primary" disabled={busy || number.trim().length < 3}>{busy ? <LoaderCircle className="spin" /> : <Send />}</button>
        </form>
        <p className="muted">أو اختر جهة اتصال واحدة لمحادثة خاصة، أو أكثر لإنشاء مجموعة.</p>
        {contacts.length === 0 && <Empty icon={Users}>لا توجد جهات اتصال بعد</Empty>}
        {contacts.map((c) => (
          <label key={c.id} className="contact-item" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(c.user.id)} onChange={() => toggle(c.user.id)} />
            <Avatar name={c.nickname || c.user.name} />
            <div className="info"><strong>{c.nickname || c.user.name}</strong></div>
          </label>
        ))}
        <button className="btn ghost" onClick={() => setAdding(true)}><UserPlus /> إضافة جهة اتصال / دعوة صديق</button>
        {selected.length > 1 && <input className="input" placeholder="اسم المجموعة" value={name} onChange={(e) => setName(e.target.value)} />}
        {error && <div className="alert error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={!selected.length || (selected.length > 1 && !name.trim())} onClick={create}>
            {selected.length > 1 ? 'إنشاء مجموعة' : 'بدء المحادثة'}
          </button>
          <button className="btn ghost" onClick={onClose}>إلغاء</button>
        </div>
      </div>
      {adding && <AddContact onClose={() => setAdding(false)} onChanged={load} />}
    </div>
  );
}

function GroupMembers({ conv, me, onClose, onUpdated, onLeft }) {
  const [contacts, setContacts] = useState([]);
  const [sel, setSel] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/contacts').then((r) => setContacts(r.data.contacts.filter((c) => !conv.members.some((m) => m.id === c.user.id)))).catch(() => {}); }, [conv]);

  const add = async () => {
    try { const { data } = await api.post(`/conversations/${conv.id}/members`, { userIds: sel }); onUpdated(data.conversation); setSel([]); }
    catch (e) { setError(errMsg(e)); }
  };
  const leave = async () => { try { await api.post(`/conversations/${conv.id}/leave`); onLeft(); } catch (e) { setError(errMsg(e)); } };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>أعضاء {conv.name}</h2>
        {conv.members.map((m) => (
          <div key={m.id} className="contact-item"><Avatar name={m.name} /><div className="info"><strong>{m.id === me ? 'أنت' : m.name}</strong></div>{m.online && <span className="chip">متصل</span>}</div>
        ))}
        {contacts.length > 0 && <strong>إضافة أعضاء</strong>}
        {contacts.map((c) => (
          <label key={c.id} className="contact-item" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(c.user.id)} onChange={() => setSel((s) => (s.includes(c.user.id) ? s.filter((x) => x !== c.user.id) : [...s, c.user.id]))} />
            <Avatar name={c.nickname || c.user.name} /><div className="info"><strong>{c.nickname || c.user.name}</strong></div>
          </label>
        ))}
        {error && <div className="alert error">{error}</div>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!sel.length} onClick={add}>إضافة</button>
          <button className="btn ghost" onClick={leave}><LogOut /> مغادرة المجموعة</button>
          <button className="btn ghost" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
