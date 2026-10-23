import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Send, Plus, MessageCircle, Users, X, Volume2, Phone, Video, Mic, Square, UserPlus, LogOut, LoaderCircle,
  ArrowRight, Search, Languages, Clock, ChevronDown, Check,
} from 'lucide-react';
import { say } from '../../lib/audio';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { useRoom } from '../../context/RoomContext';
import { useFeatures } from '../../lib/features';
import { getMic, recordClip, recordingSupported, sendAudio } from '../../lib/recorder';
import { createRecognizer, browserSpeechSupported } from '../../lib/browserSpeech';
import { LANGUAGES } from '../../lib/languages';
import api, { errMsg } from '../../services/api';
import { Avatar } from '../../components/ui';
import AddContact from '../../components/AddContact';

/* ---------------- أدوات مساعدة ---------------- */
const toast = (msg) => window.dispatchEvent(new CustomEvent('cww:toast', { detail: msg }));
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const hhmm = (d) => new Date(d).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

function listTime(d) {
  if (!d) return '';
  const now = new Date(); const t = new Date(d);
  if (sameDay(t, now)) return hhmm(t);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(t, y)) return 'أمس';
  if (now - t < 6 * 864e5) return t.toLocaleDateString('ar', { weekday: 'long' });
  return t.toLocaleDateString('ar', { day: 'numeric', month: 'numeric' });
}
function dayLabel(d) {
  const now = new Date(); const t = new Date(d);
  if (sameDay(t, now)) return 'اليوم';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(t, y)) return 'أمس';
  return t.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
}
const NAME_COLORS = ['#c0392b', '#2b7a78', '#8e44ad', '#b9770e', '#2874a6', '#1e8449', '#a04000', '#6c3483'];
const colorOf = (id) => NAME_COLORS[[...String(id)].reduce((h, c) => h + c.charCodeAt(0), 0) % NAME_COLORS.length];
const store = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

/* ---------------- الصفحة ---------------- */
export default function Chat() {
  const { user, socket } = useAuth();
  const call = useCall();
  const room = useRoom();
  const features = useFeatures();
  const location = useLocation();
  const myLang = user.settings.speakLanguage;
  const readKey = `cww_read_${user.id}`;

  const [convs, setConvs] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState(location.state?.open || null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sendLang, setSendLang] = useState(myLang);
  const [typingName, setTypingName] = useState('');
  const [unread, setUnread] = useState({});
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [picker, setPicker] = useState(false);
  const [members, setMembers] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const activeRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const clipRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);
  const stickRef = useRef(true);
  activeRef.current = activeId;

  const active = convs.find((c) => c.id === activeId);
  const others = active ? active.members.filter((m) => m.id !== user.id) : [];
  const idle = call.status === 'idle' && room.status === 'idle';
  const serverStt = features.stt?.available && recordingSupported();
  const canDictate = serverStt || browserSpeechSupported;
  const nameOf = useMemo(() => Object.fromEntries((active?.members || []).map((m) => [m.id, m.name])), [active]);

  /* ----- قراءة/عدم قراءة (محلي: يُحفظ في الجهاز) ----- */
  const markRead = useCallback((id) => {
    const map = store(readKey, {}); map[id] = new Date().toISOString();
    localStorage.setItem(readKey, JSON.stringify(map));
    setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u));
  }, [readKey]);

  const loadConvs = useCallback(async () => {
    try {
      const list = (await api.get('/conversations')).data.conversations;
      setConvs(list);
      const read = store(readKey, {});
      setUnread((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (next[c.id] === undefined && c.lastSender && String(c.lastSender) !== String(user.id) && c.lastMessageAt > (read[c.id] || '')) next[c.id] = 1;
        }
        return next;
      });
    } catch (e) { toast(errMsg(e)); } finally { setLoadingList(false); }
  }, [readKey, user.id]);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  /* ----- وضع ملء الشاشة في الجوال ----- */
  useEffect(() => {
    document.body.classList.add('on-chat');
    return () => document.body.classList.remove('on-chat', 'chat-open');
  }, []);
  useEffect(() => { document.body.classList.toggle('chat-open', !!activeId); }, [activeId]);

  /* ----- أخطاء المكالمات كإشعار عابر بدل كتلة تأخذ مساحة ----- */
  useEffect(() => { if (call.error) toast(call.error); }, [call.error]);

  /* ----- فتح محادثة ----- */
  useEffect(() => {
    if (!activeId || !socket) return undefined;
    setMessages([]); setTypingName(''); setExpanded(null); setHasMore(false);
    stickRef.current = true;
    socket.emit('chat:join', activeId);
    api.get(`/conversations/${activeId}/messages`, { params: { limit: 50 } })
      .then((r) => { setMessages(r.data.messages); setHasMore(r.data.messages.length >= 50); })
      .catch((e) => toast(errMsg(e)));
    markRead(activeId);
    return () => socket.emit('chat:leave', activeId);
  }, [activeId, socket, markRead]);

  /* ----- أحداث لحظية ----- */
  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (m) => {
      if (m.conversation !== activeRef.current) return;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        // استبدال الرسالة المؤقتة (المرسَلة تفاؤلياً) بالحقيقية
        const tmp = prev.findIndex((x) => x.pending && x.sender === m.sender && x.originalText === m.originalText);
        if (tmp >= 0) { const copy = prev.slice(); copy[tmp] = m; return copy; }
        return [...prev, m];
      });
      if (m.sender !== user.id) markRead(m.conversation);
    };
    const onActivity = (a) => {
      setConvs((prev) => {
        if (!prev.some((c) => c.id === a.conversationId)) { loadConvs(); return prev; }
        return prev.map((c) => (c.id === a.conversationId ? { ...c, lastMessage: a.lastMessage, lastMessageAt: a.lastMessageAt, lastSender: a.sender } : c))
          .sort((x, y) => new Date(y.lastMessageAt) - new Date(x.lastMessageAt));
      });
      if (a.sender !== user.id && a.conversationId !== activeRef.current) setUnread((u) => ({ ...u, [a.conversationId]: (u[a.conversationId] || 0) + 1 }));
    };
    const onTyping = ({ conversationId, name, isTyping, userId }) => {
      if (conversationId !== activeRef.current || userId === user.id) return;
      setTypingName(isTyping ? name : '');
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:activity', onActivity);
    socket.on('chat:typing', onTyping);
    return () => { socket.off('chat:message', onMessage); socket.off('chat:activity', onActivity); socket.off('chat:typing', onTyping); };
  }, [socket, user.id, loadConvs, markRead]);

  /* ----- التمرير ----- */
  const scrollToEnd = (smooth) => { const el = listRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  const firstScroll = useRef(true);
  useEffect(() => { firstScroll.current = true; }, [activeId]);
  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd(!firstScroll.current);   // أول تحميل: قفز فوري، بعده تمرير سلس
    if (messages.length) firstScroll.current = false;
  }, [messages, typingName]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = near; setAtBottom(near);
  };

  const loadOlder = async () => {
    const el = listRef.current; const prevH = el?.scrollHeight || 0;
    try {
      const { data } = await api.get(`/conversations/${activeId}/messages`, { params: { limit: 50, before: messages[0]?.createdAt } });
      stickRef.current = false;
      setMessages((m) => [...data.messages, ...m]);
      setHasMore(data.messages.length >= 50);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    } catch (e) { toast(errMsg(e)); }
  };

  /* ----- حقل الكتابة ----- */
  useLayoutEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text, activeId]);

  const send = (e) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || !activeId) return;
    const tmpId = `tmp-${Date.now()}`;
    stickRef.current = true;
    setMessages((m) => [...m, { id: tmpId, pending: true, conversation: activeId, sender: user.id, originalText: value, sourceLanguage: sendLang, translations: {}, createdAt: new Date().toISOString() }]);
    setText('');
    socket.emit('chat:typing', { conversationId: activeId, isTyping: false });
    socket.emit('chat:send', { conversationId: activeId, text: value, language: sendLang }, (res) => {
      if (res?.ok) {
        setMessages((m) => (m.some((x) => x.id === res.message.id) ? m.filter((x) => x.id !== tmpId) : m.map((x) => (x.id === tmpId ? res.message : x))));
      } else {
        setMessages((m) => m.filter((x) => x.id !== tmpId));
        setText(value);
        toast(res?.error || 'فشل الإرسال');
      }
    });
  };

  const onKey = (e) => {
    // حاسوب: Enter يرسل وShift+Enter سطر جديد. جوال: Enter سطر جديد والإرسال بالزر.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) send(e);
  };
  const onType = (e) => {
    setText(e.target.value);
    socket?.emit('chat:typing', { conversationId: activeId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit('chat:typing', { conversationId: activeId, isTyping: false }), 1500);
  };

  useEffect(() => () => { recogRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const dictate = async () => {
    if (dictating) {
      setDictating(false);
      if (serverStt) {
        const r = await clipRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clipRef.current = null;
        if (r && r.ms > 500) {
          setTranscribing(true);
          try { const { data } = await sendAudio(api, '/translate/stt', r.blob, r.mime, { language: sendLang }); setText((t) => `${t} ${data.data.text}`.trim()); }
          catch (e) { toast(errMsg(e)); } finally { setTranscribing(false); }
        }
      } else recogRef.current?.stop();
      return;
    }
    if (serverStt) {
      try { streamRef.current = await getMic(); clipRef.current = recordClip(streamRef.current); setDictating(true); }
      catch { toast('اسمح للمتصفح باستخدام الميكروفون'); }
      return;
    }
    const rec = createRecognizer({
      lang: sendLang,
      onFinal: (t) => setText((x) => `${x} ${t}`.trim()),
      onError: (c) => toast(c === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : `خطأ في التعرف على الصوت: ${c}`),
      onEnd: () => setDictating(false),
    });
    recogRef.current = rec; setDictating(true); rec.start();
  };

  const callChat = (video) => {
    if (!active) return;
    if (!active.isGroup) call.startCall({ id: others[0].id, name: others[0].name, phone: others[0].phone }, video);
    else room.startRoom(others.slice(0, 5).map((m) => m.id), video);
  };

  /* ----- عرض الرسائل مجمّعة (فواصل أيام + تتابع المرسل) ----- */
  const rows = useMemo(() => {
    const out = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1]; const next = messages[i + 1];
      if (!prev || !sameDay(prev.createdAt, m.createdAt)) out.push({ type: 'day', key: `d${m.id}`, label: dayLabel(m.createdAt) });
      const near = (a, b) => a && b && a.sender === b.sender && sameDay(a.createdAt, b.createdAt) && Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < 5 * 60e3;
      out.push({ type: 'msg', key: m.id, m, first: !near(prev, m), last: !near(m, next) });
    });
    return out;
  }, [messages]);

  const renderMsg = ({ m, first, last }) => {
    const mine = m.sender === user.id;
    const translated = !mine ? m.translations?.[myLang] : null;
    const shown = translated || m.originalText;
    const open = expanded === m.id;
    return (
      <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}${first ? ' first' : ''}${last ? ' last' : ''}`}>
        <div className={`bubble${open ? ' open' : ''}`} onClick={() => setExpanded(open ? null : m.id)}>
          {active?.isGroup && !mine && first && <span className="msg-name" style={{ color: colorOf(m.sender) }}>{nameOf[m.sender] || 'عضو'}</span>}
          <span className="msg-text">{shown}</span>
          <span className="msg-meta">
            {translated && <Languages size={12} aria-label="مترجمة" />}
            {hhmm(m.createdAt)}
            {mine && (m.pending ? <Clock size={12} /> : <Check size={13} />)}
          </span>
          {open && (
            <div className="msg-extra">
              {translated && <div className="orig"><small>النص الأصلي</small>{m.originalText}</div>}
              <button type="button" className="btn small ghost" onClick={(e) => { e.stopPropagation(); say({ text: shown, lang: translated ? myLang : m.sourceLanguage }); }}><Volume2 /> نطق</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ----- قائمة المحادثات ----- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? convs.filter((c) => c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q)) : convs;
  }, [convs, query]);

  const preview = (c) => {
    if (!c.lastMessage) return 'ابدأ المحادثة';
    const mine = String(c.lastSender) === String(user.id);
    const who = mine ? 'أنت: ' : c.isGroup ? `${c.members.find((m) => m.id === String(c.lastSender))?.name?.split(' ')[0] || ''}: ` : '';
    return who + c.lastMessage;
  };

  const subtitle = typingName ? (active?.isGroup ? `${typingName} يكتب…` : 'يكتب…')
    : active?.isGroup ? `${active.members.length} أعضاء` : others[0]?.online ? 'متصل الآن' : '';

  return (
    <div className={`chat${active ? ' show-thread' : ''}`}>
      {/* ============ القائمة ============ */}
      <aside className="chat-list">
        <header className="chat-top">
          {searching ? (
            <div className="search-box grow">
              <Search size={18} />
              <input className="input" autoFocus placeholder="ابحث في المحادثات" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          ) : <h1>المحادثات</h1>}
          <div className="chat-top-actions">
            <button className="btn icon ghost" onClick={() => { setSearching((s) => !s); setQuery(''); }} aria-label={searching ? 'إغلاق البحث' : 'بحث'}>{searching ? <X /> : <Search />}</button>
            <button className="btn icon primary new-chat-btn" onClick={() => setPicker(true)} aria-label="محادثة جديدة"><Plus /></button>
          </div>
        </header>

        <div className="conv-scroll">
          {loadingList ? <div className="empty"><LoaderCircle className="spin" /></div>
            : filtered.length === 0 ? (
              <div className="empty chat-empty">
                <MessageCircle />
                <strong>{query ? 'لا نتائج' : 'لا توجد محادثات بعد'}</strong>
                {!query && <><p className="muted">اكتب بلغتك ويقرأ الطرف الآخر بلغته.</p><button className="btn primary" onClick={() => setPicker(true)}><Plus /> ابدأ محادثة</button></>}
              </div>
            ) : filtered.map((c) => {
              const n = unread[c.id] || 0;
              const peer = !c.isGroup ? c.members.find((m) => m.id !== user.id) : null;
              return (
                <button key={c.id} className={`conv-item${c.id === activeId ? ' active' : ''}${n ? ' unread' : ''}`} onClick={() => { setActiveId(c.id); markRead(c.id); }}>
                  <Avatar name={c.name || '?'} online={peer?.online} />
                  <div className="info">
                    <div className="conv-line"><strong>{c.name}</strong><time>{listTime(c.lastMessageAt)}</time></div>
                    <div className="conv-line"><small>{preview(c)}</small>{n > 0 && <span className="badge-count">{n > 99 ? '99+' : n}</span>}</div>
                  </div>
                </button>
              );
            })}
        </div>
        <button className="fab" onClick={() => setPicker(true)} aria-label="محادثة جديدة"><MessageCircle /></button>
      </aside>

      {/* ============ المحادثة ============ */}
      <section className="chat-thread">
        {!active ? (
          <div className="empty chat-empty big"><MessageCircle /><strong>CWW للمراسلة</strong><p className="muted">اختر محادثة من القائمة أو ابدأ واحدة جديدة.<br />كل رسالة تُترجم تلقائياً إلى لغة قارئها.</p></div>
        ) : (
          <>
            <header className="thread-head">
              <button className="btn icon ghost chat-back" onClick={() => setActiveId(null)} aria-label="رجوع"><ArrowRight /></button>
              <button className="thread-id" onClick={() => active.isGroup && setMembers(true)}>
                <Avatar name={active.name || '?'} online={!active.isGroup && others[0]?.online} />
                <span className="info"><strong>{active.name}</strong>{subtitle && <small className={typingName ? 'typing-now' : ''}>{subtitle}</small>}</span>
              </button>
              <div className="thread-actions">
                <button className="btn icon ghost" disabled={!idle || !others.length} onClick={() => callChat(true)} aria-label="مكالمة فيديو"><Video /></button>
                <button className="btn icon ghost" disabled={!idle || !others.length} onClick={() => callChat(false)} aria-label="مكالمة صوتية"><Phone /></button>
              </div>
            </header>

            <div className="messages" ref={listRef} onScroll={onScroll}>
              {hasMore && <button className="load-older" onClick={loadOlder}>تحميل الرسائل الأقدم</button>}
              {rows.length === 0 && <div className="empty-hint">لا رسائل بعد — قل مرحباً 👋</div>}
              {rows.map((r) => (r.type === 'day' ? <div key={r.key} className="day-sep"><span>{r.label}</span></div> : renderMsg(r)))}
            </div>

            {!atBottom && <button className="to-bottom" onClick={() => { stickRef.current = true; scrollToEnd(true); }} aria-label="إلى آخر رسالة"><ChevronDown /></button>}

            <form className="composer" onSubmit={send}>
              <label className="lang-chip" title="لغة كتابتك">
                <span>{sendLang.toUpperCase()}</span>
                <select value={sendLang} onChange={(e) => setSendLang(e.target.value)} aria-label="لغة الكتابة">
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
                </select>
              </label>
              <div className="input-pill">
                <textarea ref={inputRef} rows={1} value={text} onChange={onType} onKeyDown={onKey} maxLength={4000}
                  placeholder={dictating ? 'جارٍ الاستماع… اضغط ■ للإنهاء' : 'اكتب رسالة'} enterKeyHint="enter" autoComplete="off" />
              </div>
              {text.trim() || !canDictate
                ? <button type="submit" className="btn round primary send" disabled={!text.trim()} aria-label="إرسال"><Send /></button>
                : <button type="button" className={`btn round mic-btn${dictating ? ' rec' : ''}`} onClick={dictate} disabled={transcribing} aria-label="إملاء صوتي">
                  {transcribing ? <LoaderCircle className="spin" /> : dictating ? <Square /> : <Mic />}
                </button>}
            </form>
          </>
        )}
      </section>

      {picker && <NewChat onClose={() => setPicker(false)} onCreated={(c) => {
        setConvs((p) => (p.some((x) => x.id === c.id) ? p : [c, ...p]));
        setActiveId(c.id); setPicker(false);
      }} />}
      {members && active && <GroupMembers conv={active} me={user.id} onClose={() => setMembers(false)}
        onUpdated={(c) => setConvs((p) => p.map((x) => (x.id === c.id ? c : x)))}
        onLeft={() => { setMembers(false); setActiveId(null); loadConvs(); }} />}
    </div>
  );
}

/* ---------------- محادثة جديدة: بحث بين جهاتك أو برقم/اسم، ومجموعة ---------------- */
function NewChat({ onClose, onCreated }) {
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/contacts').then((r) => setContacts(r.data.contacts)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => (needle
    ? contacts.filter((c) => (c.nickname || c.user.name).toLowerCase().includes(needle) || c.user.phone.includes(needle))
    : contacts), [contacts, needle]);

  // لا تطابق بين جهاتك؟ ابحث في CWW نفسه (رقم/بريد/اسم)
  useEffect(() => {
    setRemote([]);
    if (needle.length < 3 || list.length) return undefined;
    setLookingUp(true);
    const t = setTimeout(async () => {
      try { setRemote((await api.get('/users/search', { params: { q: q.trim() } })).data.users); } catch { /* لا نتائج */ } finally { setLookingUp(false); }
    }, 400);
    return () => { clearTimeout(t); setLookingUp(false); };
  }, [needle, list.length, q]);

  const start = async (userId) => {
    setBusy(true); setError('');
    try { const { data } = await api.post('/conversations', { userId }); onCreated(data.conversation); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  const createGroup = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post('/conversations', { memberIds: selected, name }); onCreated(data.conversation); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const tap = (id) => (groupMode ? toggle(id) : start(id));

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal newchat" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{groupMode ? 'مجموعة جديدة' : 'محادثة جديدة'}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="إغلاق"><X /></button>
        </div>
        <div className="search-box"><Search size={18} /><input className="input" autoFocus placeholder="اسم أو رقم هاتف أو بريد" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" /></div>

        {!groupMode && (
          <div className="quick-actions">
            <button className="quick" onClick={() => setGroupMode(true)}><span className="more-ico"><Users /></span>مجموعة جديدة</button>
            <button className="quick" onClick={() => setAdding(true)}><span className="more-ico"><UserPlus /></span>إضافة جهة اتصال</button>
          </div>
        )}
        {groupMode && selected.length > 0 && (
          <div className="chips">{selected.map((id) => { const c = contacts.find((x) => x.user.id === id); return <button key={id} className="chip active" onClick={() => toggle(id)}>{c?.nickname || c?.user.name} <X size={12} /></button>; })}</div>
        )}

        <div className="newchat-list">
          {list.map((c) => (
            <button key={c.id} className="conv-item" disabled={busy} onClick={() => tap(c.user.id)}>
              <Avatar name={c.nickname || c.user.name} online={c.user.online} />
              <div className="info"><strong>{c.nickname || c.user.name}</strong><small style={{ display: 'inline-block', direction: 'ltr' }}>{c.user.phone}</small></div>
              {groupMode && <span className={`check${selected.includes(c.user.id) ? ' on' : ''}`}>{selected.includes(c.user.id) && <Check size={14} />}</span>}
            </button>
          ))}
          {lookingUp && <div className="empty"><LoaderCircle className="spin" /></div>}
          {remote.map((u) => (
            <button key={u.id} className="conv-item" disabled={busy} onClick={() => tap(u.id)}>
              <Avatar name={u.name} />
              <div className="info"><strong>{u.name}</strong><small className="muted">على CWW · <span style={{ display: 'inline-block', direction: 'ltr' }}>{u.phone}</span></small></div>
            </button>
          ))}
          {!list.length && !lookingUp && !remote.length && (
            <div className="empty">{needle.length >= 3 ? 'لم نجد أحداً. ادعُه عبر «إضافة جهة اتصال ← دعوة».' : contacts.length ? 'لا نتائج' : 'لا توجد جهات اتصال بعد'}</div>
          )}
        </div>

        {error && <div className="alert error">{error}</div>}
        {groupMode && (
          <div className="sheet-foot">
            <input className="input" placeholder="اسم المجموعة" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <div className="sheet-actions">
              <button className="btn primary" disabled={busy || selected.length < 2 || !name.trim()} onClick={createGroup}>{busy ? <LoaderCircle className="spin" /> : 'إنشاء'} ({selected.length})</button>
              <button className="btn ghost" onClick={() => { setGroupMode(false); setSelected([]); }}>رجوع</button>
            </div>
            {selected.length < 2 && <small className="muted">اختر عضوين على الأقل.</small>}
          </div>
        )}
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
      <div className="card modal newchat" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>{conv.name}</h2><button className="btn icon ghost" onClick={onClose} aria-label="إغلاق"><X /></button></div>
        <small className="muted">{conv.members.length} أعضاء</small>
        <div className="newchat-list">
          {conv.members.map((m) => (
            <div key={m.id} className="conv-item static"><Avatar name={m.name} online={m.online} /><div className="info"><strong>{m.id === me ? 'أنت' : m.name}</strong></div></div>
          ))}
          {contacts.length > 0 && <div className="dgroup-title">إضافة أعضاء</div>}
          {contacts.map((c) => (
            <button key={c.id} className="conv-item" onClick={() => setSel((s) => (s.includes(c.user.id) ? s.filter((x) => x !== c.user.id) : [...s, c.user.id]))}>
              <Avatar name={c.nickname || c.user.name} /><div className="info"><strong>{c.nickname || c.user.name}</strong></div>
              <span className={`check${sel.includes(c.user.id) ? ' on' : ''}`}>{sel.includes(c.user.id) && <Check size={14} />}</span>
            </button>
          ))}
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="sheet-actions">
          <button className="btn primary" disabled={!sel.length} onClick={add}>إضافة ({sel.length})</button>
          <button className="btn ghost danger" onClick={leave}><LogOut /> مغادرة المجموعة</button>
        </div>
      </div>
    </div>
  );
}
