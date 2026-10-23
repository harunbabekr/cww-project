import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Send,
  Plus,
  MessageCircle,
  Users,
  X,
  Volume2,
  Phone,
  Video,
  Mic,
  Square,
  UserPlus,
  LogOut,
  LoaderCircle,
  ArrowRight,
  Search,
  CheckCheck,
} from 'lucide-react';
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

function formatConvTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' });
}

export default function Chat() {
  const { user, socket } = useAuth();
  const call = useCall();
  const room = useRoom();
  const features = useFeatures();
  const location = useLocation();
  const myLang = user.settings.speakLanguage;

  const [convs, setConvs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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
    try {
      setConvs((await api.get('/conversations')).data.conversations);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  useEffect(() => {
    if (!activeId || !socket) return undefined;
    setMessages([]);
    setTyping('');
    socket.emit('chat:join', activeId);
    api
      .get(`/conversations/${activeId}/messages`)
      .then((r) => setMessages(r.data.messages))
      .catch((e) => setError(errMsg(e)));
    return () => socket.emit('chat:leave', activeId);
  }, [activeId, socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (m) => {
      if (m.conversation === activeRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
      setConvs((prev) => {
        if (!prev.some((c) => c.id === m.conversation)) {
          loadConvs();
          return prev;
        }
        return prev
          .map((c) =>
            c.id === m.conversation
              ? { ...c, lastMessage: m.originalText, lastMessageAt: m.createdAt }
              : c
          )
          .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      });
    };
    const onTyping = ({ conversationId, name, isTyping, userId }) => {
      if (conversationId !== activeRef.current || userId === user.id) return;
      setTyping(isTyping ? `${name} يكتب…` : '');
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
    };
  }, [socket, user.id, loadConvs]);

  // في الجوال تُعرض المحادثة بملء الشاشة (يخفي الشريط السفلي عبر CSS تماماً مثل واتساب)
  useEffect(() => {
    document.body.classList.toggle('chat-open', !!activeId);
    return () => document.body.classList.remove('chat-open');
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(
    () => () => {
      recogRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

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
    typingTimer.current = setTimeout(
      () => socket?.emit('chat:typing', { conversationId: activeId, isTyping: false }),
      1500
    );
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
          try {
            const { data } = await sendAudio(api, '/translate/stt', r.blob, r.mime, {
              language: sendLang,
            });
            setText((t) => `${t} ${data.data.text}`.trim());
          } catch (e) {
            setError(errMsg(e));
          } finally {
            setTranscribing(false);
          }
        }
      } else recogRef.current?.stop();
      return;
    }
    if (serverStt) {
      try {
        streamRef.current = await getMic();
        clipRef.current = recordClip(streamRef.current);
        setDictating(true);
      } catch {
        setError('اسمح للمتصفح باستخدام الميكروفون');
      }
      return;
    }
    const rec = createRecognizer({
      lang: sendLang,
      onFinal: (t) => setText((x) => `${x} ${t}`.trim()),
      onError: (c) =>
        setError(
          c === 'not-allowed'
            ? 'اسمح للمتصفح باستخدام الميكروفون'
            : `خطأ في التعرف على الصوت: ${c}`
        ),
      onEnd: () => setDictating(false),
    });
    recogRef.current = rec;
    setDictating(true);
    rec.start();
  };

  const others = active ? active.members.filter((m) => m.id !== user.id) : [];
  const peerOnline = !active?.isGroup && others[0]?.online;

  const callChat = (video) => {
    if (!active) return;
    if (!active.isGroup) {
      call.startCall({ id: others[0].id, name: others[0].name, phone: others[0].phone }, video);
    } else {
      room.startRoom(
        others.slice(0, 5).map((m) => m.id),
        video
      );
    }
  };

  const filteredConvs = convs.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  const render = (m) => {
    const mine = m.sender === user.id;
    const translated = !mine ? m.translations?.[myLang] : null;
    const shown = translated || m.originalText;
    const timeStr = new Date(m.createdAt).toLocaleTimeString('ar', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div
        key={m.id}
        className={`bubble${mine ? ' mine' : ''}`}
        onClick={() => translated && setShowOriginal((s) => ({ ...s, [m.id]: !s[m.id] }))}
        style={{ cursor: translated ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ flex: 1 }}>{shown}</span>
          <button
            type="button"
            className="bubble-speak"
            onClick={(e) => {
              e.stopPropagation();
              say({ text: shown, lang: translated ? myLang : m.sourceLanguage });
            }}
            aria-label="نطق"
          >
            <Volume2 size={14} />
          </button>
        </div>

        {translated && showOriginal[m.id] && <span className="orig">{m.originalText}</span>}

        <div className="wa-bubble-meta">
          <span>
            {timeStr}
            {translated ? ' · مترجمة (اضغط للأصل)' : ''}
          </span>
          {mine && <CheckCheck size={14} style={{ color: '#2ba39b' }} />}
        </div>
      </div>
    );
  };

  const alerts = (
    <>
      {error && (
        <div className="alert error row between chat-alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="إغلاق">
            <X size={16} />
          </button>
        </div>
      )}
      {call.error && <div className="alert error chat-alert">{call.error}</div>}
    </>
  );

  const hasText = text.trim().length > 0;

  return (
    <div className={`chat-page${active ? ' in-thread' : ''}`}>
      <PageHeader
        eyebrow="دردشة الرسائل"
        title="الرسائل"
        subtitle="تكتب بلغتك ويقرأ كل شخص بلغته."
      />
      {!active && alerts}

      <div className={`chat wa-chat${active ? ' show-thread' : ''}`}>
        {/* القائمة الجانبية للمحادثات بأسلوب واتساب */}
        <aside className="card chat-list">
          <div className="wa-list-header">
            <h2>الدردشات</h2>
            <button
              type="button"
              className="btn small primary"
              onClick={() => setPicker(true)}
              aria-label="محادثة جديدة"
            >
              <Plus size={18} /> جديد
            </button>
          </div>

          <div className="wa-search-box">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={16}
                style={{ position: 'absolute', right: 12, color: 'var(--muted)', pointerEvents: 'none' }}
              />
              <input
                type="search"
                placeholder="ابحث في الدردشات…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: 36 }}
              />
            </div>
          </div>

          <div className="wa-conv-scroll">
            {filteredConvs.length === 0 && (
              <Empty icon={MessageCircle}>
                {searchQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد محادثات بعد'}
              </Empty>
            )}
            {filteredConvs.map((c) => {
              const peer = !c.isGroup ? c.members?.find((m) => m.id !== user.id) : null;
              return (
                <button
                  key={c.id}
                  className={`conv-item${c.id === activeId ? ' active' : ''}`}
                  onClick={() => setActiveId(c.id)}
                >
                  <Avatar name={c.name} online={peer?.online} />
                  <div className="info">
                    <div className="wa-conv-top">
                      <strong>{c.name}</strong>
                      <span className="wa-conv-time">{formatConvTime(c.lastMessageAt)}</span>
                    </div>
                    <small>{c.lastMessage || 'ابدأ المحادثة الآن'}</small>
                  </div>
                </button>
              );
            })}
          </div>

          {/* الزر العائم (+) على طريقة واتساب */}
          <button
            type="button"
            className="wa-fab"
            onClick={() => setPicker(true)}
            aria-label="محادثة جديدة"
          >
            <Plus size={24} />
          </button>
        </aside>

        {/* شاشة المحادثة النشطة */}
        <section className="card chat-thread">
          {!active ? (
            <Empty icon={MessageCircle}>اختر محادثة أو ابدأ واحدة جديدة</Empty>
          ) : (
            <>
              <div className="thread-head">
                <button
                  className="btn icon ghost chat-back"
                  onClick={() => setActiveId(null)}
                  aria-label="رجوع إلى المحادثات"
                >
                  <ArrowRight />
                </button>
                <Avatar name={active.name} online={peerOnline} />
                <div className="info">
                  <strong>{active.name}</strong>
                  <small>
                    {typing
                      ? typing
                      : active.isGroup
                        ? `${active.members.length} أعضاء`
                        : peerOnline
                          ? 'متصل الآن'
                          : 'تُترجم الرسائل تلقائياً'}
                  </small>
                </div>
                <div className="thread-actions">
                  <button
                    className="btn icon ghost"
                    disabled={!idle || !others.length}
                    onClick={() => callChat(false)}
                    aria-label="مكالمة صوتية"
                  >
                    <Phone />
                  </button>
                  <button
                    className="btn icon ghost"
                    disabled={!idle || !others.length}
                    onClick={() => callChat(true)}
                    aria-label="مكالمة فيديو"
                  >
                    <Video />
                  </button>
                  {active.isGroup && (
                    <button
                      className="btn icon ghost"
                      onClick={() => setMembers(true)}
                      aria-label="الأعضاء"
                    >
                      <Users />
                    </button>
                  )}
                </div>
              </div>

              {alerts}

              <div className="messages">
                {messages.map(render)}
                <div ref={endRef} />
              </div>

              <form className="composer" onSubmit={send}>
                <div className="composer-row">
                  <input
                    className="input"
                    value={text}
                    onChange={onType}
                    placeholder={dictating ? 'جارٍ الاستماع… تحدث الآن' : 'اكتب رسالتك…'}
                    maxLength={4000}
                    enterKeyHint="send"
                    autoComplete="off"
                  />

                  {/* زر موحد ذكي مثل واتساب: إذا وجد نص يرسل، وإذا كان فارغاً يسجل صوتياً */}
                  {hasText ? (
                    <button type="submit" className="btn wa-send-btn" aria-label="إرسال">
                      <Send size={20} />
                    </button>
                  ) : canDictate ? (
                    <button
                      type="button"
                      className={`btn wa-send-btn${dictating ? ' recording' : ''}`}
                      onClick={dictate}
                      disabled={transcribing}
                      aria-label="إملاء صوتي"
                    >
                      {transcribing ? (
                        <LoaderCircle size={20} className="spin" />
                      ) : dictating ? (
                        <Square size={18} />
                      ) : (
                        <Mic size={20} />
                      )}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn wa-send-btn"
                      disabled={!hasText}
                      aria-label="إرسال"
                    >
                      <Send size={20} />
                    </button>
                  )}
                </div>

                <label className="composer-lang">
                  <span>أكتب بلغة:</span>
                  <select
                    className="select"
                    value={sendLang}
                    onChange={(e) => setSendLang(e.target.value)}
                    aria-label="لغة الكتابة"
                  >
                    <LangOptions />
                  </select>
                </label>
              </form>
            </>
          )}
        </section>
      </div>

      {picker && (
        <NewChat
          onClose={() => setPicker(false)}
          onCreated={(c) => {
            setConvs((p) => (p.some((x) => x.id === c.id) ? p : [c, ...p]));
            setActiveId(c.id);
            setPicker(false);
          }}
        />
      )}
      {members && active && (
        <GroupMembers
          conv={active}
          me={user.id}
          onClose={() => setMembers(false)}
          onUpdated={(c) => setConvs((p) => p.map((x) => (x.id === c.id ? c : x)))}
          onLeft={() => {
            setMembers(false);
            setActiveId(null);
            loadConvs();
          }}
        />
      )}
    </div>
  );
}

function LangOptions() {
  return LANGUAGES.map((l) => (
    <option key={l.code} value={l.code}>
      {l.native}
    </option>
  ));
}

function NewChat({ onClose, onCreated }) {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .get('/contacts')
        .then((r) => setContacts(r.data.contacts))
        .catch((e) => setError(errMsg(e))),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    try {
      const body = selected.length === 1 ? { userId: selected[0] } : { memberIds: selected, name };
      const { data } = await api.post('/conversations', body);
      onCreated(data.conversation);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  // مراسلة رقم مباشرة دون المرور بإضافة جهة اتصال
  const byNumber = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get('/users/search', { params: { q: number } });
      if (!data.user) {
        setError('هذا الرقم/الاسم غير مسجّل في CWW. أرسل له رابط دعوة من «إضافة جهة اتصال».');
        return;
      }
      const res = await api.post('/conversations', { userId: data.user.id });
      onCreated(res.data.conversation);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>محادثة جديدة</h2>
        <form className="row" onSubmit={byNumber}>
          <input
            className="input"
            placeholder="راسل رقماً مباشرة: 0912345678"
            inputMode="search"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button className="btn small primary" disabled={busy || number.trim().length < 3}>
            {busy ? <LoaderCircle className="spin" /> : <Send />}
          </button>
        </form>
        <p className="muted">أو اختر جهة اتصال واحدة لمحادثة خاصة، أو أكثر لإنشاء مجموعة.</p>
        {contacts.length === 0 && <Empty icon={Users}>لا توجد جهات اتصال بعد</Empty>}
        {contacts.map((c) => (
          <label key={c.id} className="contact-item" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.includes(c.user.id)}
              onChange={() => toggle(c.user.id)}
            />
            <Avatar name={c.nickname || c.user.name} />
            <div className="info">
              <strong>{c.nickname || c.user.name}</strong>
            </div>
          </label>
        ))}
        <button className="btn ghost" onClick={() => setAdding(true)}>
          <UserPlus /> إضافة جهة اتصال / دعوة صديق
        </button>
        {selected.length > 1 && (
          <input
            className="input"
            placeholder="اسم المجموعة"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {error && <div className="alert error">{error}</div>}
        <div className="row">
          <button
            className="btn primary"
            disabled={!selected.length || (selected.length > 1 && !name.trim())}
            onClick={create}
          >
            {selected.length > 1 ? 'إنشاء مجموعة' : 'بدء المحادثة'}
          </button>
          <button className="btn ghost" onClick={onClose}>
            إلغاء
          </button>
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

  useEffect(() => {
    api
      .get('/contacts')
      .then((r) =>
        setContacts(
          r.data.contacts.filter((c) => !conv.members.some((m) => m.id === c.user.id))
        )
      )
      .catch(() => {});
  }, [conv]);

  const add = async () => {
    try {
      const { data } = await api.post(`/conversations/${conv.id}/members`, { userIds: sel });
      onUpdated(data.conversation);
      setSel([]);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const leave = async () => {
    try {
      await api.post(`/conversations/${conv.id}/leave`);
      onLeft();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>أعضاء {conv.name}</h2>
        {conv.members.map((m) => (
          <div key={m.id} className="contact-item">
            <Avatar name={m.name} />
            <div className="info">
              <strong>{m.id === me ? 'أنت' : m.name}</strong>
            </div>
            {m.online && <span className="chip">متصل</span>}
          </div>
        ))}
        {contacts.length > 0 && <strong>إضافة أعضاء</strong>}
        {contacts.map((c) => (
          <label key={c.id} className="contact-item" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={sel.includes(c.user.id)}
              onChange={() =>
                setSel((s) =>
                  s.includes(c.user.id) ? s.filter((x) => x !== c.user.id) : [...s, c.user.id]
                )
              }
            />
            <Avatar name={c.nickname || c.user.name} />
            <div className="info">
              <strong>{c.nickname || c.user.name}</strong>
            </div>
          </label>
        ))}
        {error && <div className="alert error">{error}</div>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!sel.length} onClick={add}>
            إضافة
          </button>
          <button className="btn ghost" onClick={leave}>
            <LogOut /> مغادرة المجموعة
          </button>
          <button className="btn ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}