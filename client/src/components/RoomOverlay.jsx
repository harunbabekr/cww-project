import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Languages, Volume2, VolumeX, UserPlus, Users } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { Avatar } from './ui';
import api from '../services/api';

function Tile({ name, stream, video, local, state, quiet }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream || null;
    if (!local) ref.current.volume = quiet ? 0.25 : 1; // نخفض الأصل أثناء نطق الترجمة
  }, [stream, quiet, local]);
  const showVideo = video && stream && stream.getVideoTracks().length > 0;
  return (
    <div className={`room-tile${local ? ' local' : ''}`}>
      {showVideo ? <video ref={ref} autoPlay playsInline muted={local} /> : (
        <>
          <Avatar name={name} />
          <audio ref={ref} autoPlay muted={local} />
        </>
      )}
      <span className="room-name">{local ? 'أنا' : name}{!local && state && state !== 'connected' ? ' · يتصل…' : ''}</span>
    </div>
  );
}

function InvitePicker({ exclude, onDone, inviteMore }) {
  const [contacts, setContacts] = useState([]);
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/contacts').then((r) => setContacts(r.data.contacts.filter((c) => !exclude.includes(c.user.id)))).catch(() => {}); }, [exclude]);
  const go = async () => {
    const res = await inviteMore(sel);
    if (res?.ok) onDone(); else setMsg(res?.error || 'تعذّرت الدعوة');
  };
  return (
    <div className="room-invite">
      <strong>دعوة مشاركين</strong>
      {contacts.length === 0 && <small style={{ opacity: 0.7 }}>لا توجد جهات أخرى</small>}
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {contacts.map((c) => (
          <label key={c.id} className="row" style={{ gap: 8, padding: '4px 0' }}>
            <input type="checkbox" checked={sel.includes(c.user.id)} onChange={() => setSel((s) => (s.includes(c.user.id) ? s.filter((x) => x !== c.user.id) : [...s, c.user.id]))} />
            {c.nickname || c.user.name}{c.user.online ? ' 🟢' : ''}
          </label>
        ))}
      </div>
      {msg && <small style={{ color: '#ff9b86' }}>{msg}</small>}
      <div className="row"><button className="btn small primary" disabled={!sel.length} onClick={go}>دعوة</button><button className="btn small ghost" onClick={onDone}>إلغاء</button></div>
    </div>
  );
}

export default function RoomOverlay() {
  const r = useRoom();
  const [inviting, setInviting] = useState(false);
  if (!r || (r.status === 'idle' && !r.notice)) return null;

  if (r.status === 'idle') {
    return <div className="toast" role="alert" onClick={r.clearNotice}>{r.notice}</div>;
  }

  if (r.status === 'incoming') {
    return (
      <div className="call-overlay">
        <div className="call-box">
          <div className="call-avatar"><Users size={40} /></div>
          <h2>{r.invite.fromName}</h2>
          <p style={{ opacity: 0.7 }}>{r.invite.video ? 'مكالمة فيديو جماعية' : 'مكالمة صوتية جماعية'} — ستُترجم تلقائياً لكل مشارك</p>
          <div className="call-controls">
            <button className="btn round end" onClick={r.declineInvite} aria-label="رفض"><PhoneOff /></button>
            <button className="btn round accept" onClick={r.acceptInvite} aria-label="انضمام"><Phone /></button>
          </div>
        </div>
      </div>
    );
  }

  const people = Object.values(r.people);
  const quiet = r.translateOn && r.speakTranslation;
  const video = !!r.room?.video;

  return (
    <div className="call-overlay">
      <div className="call-box" style={{ maxWidth: 760 }}>
        <div className="room-grid" data-count={people.length + 1}>
          <Tile name="أنا" stream={r.localStream} video={video} local />
          {people.map((p) => <Tile key={p.id} name={p.name} stream={p.stream} video={video} state={p.state} quiet={quiet} />)}
        </div>
        {people.length === 0 && <p style={{ opacity: 0.7 }}>بانتظار انضمام المدعوين…</p>}

        {r.translateOn && (
          <div className="captions" style={{ position: 'static' }}>
            {r.captions.slice(-4).map((c) => (
              <div key={c.id} className={`caption${c.mine ? ' mine' : ''}`}>{c.system ? <em style={{ opacity: 0.7 }}>{c.text}</em> : <>{c.name && <b>{c.name}: </b>}{c.text}</>}</div>
            ))}
          </div>
        )}

        {inviting && <InvitePicker exclude={[...people.map((p) => p.id)]} inviteMore={r.inviteMore} onDone={() => setInviting(false)} />}

        <div className="call-controls">
          <button className={`btn round${r.muted ? ' off' : ''}`} onClick={r.toggleMute} aria-label="كتم">{r.muted ? <MicOff /> : <Mic />}</button>
          {video && <button className={`btn round${!r.cameraOn ? ' off' : ''}`} onClick={r.toggleCamera} aria-label="الكاميرا">{r.cameraOn ? <Video /> : <VideoOff />}</button>}
          <button className={`btn round${!r.translateOn ? ' off' : ''}`} onClick={() => r.setTranslateOn(!r.translateOn)} aria-label="الترجمة"><Languages /></button>
          <button className={`btn round${!r.speakTranslation ? ' off' : ''}`} onClick={() => r.setSpeakTranslation(!r.speakTranslation)} aria-label="نطق الترجمة">{r.speakTranslation ? <Volume2 /> : <VolumeX />}</button>
          <button className="btn round" onClick={() => setInviting((v) => !v)} aria-label="دعوة"><UserPlus /></button>
          <button className="btn round end" onClick={r.leave} aria-label="مغادرة"><PhoneOff /></button>
        </div>
        <small style={{ opacity: 0.55 }}>استخدم سماعات لأفضل ترجمة. حتى 6 مشاركين.</small>
      </div>
    </div>
  );
}
