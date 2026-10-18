import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Languages, Volume2, VolumeX } from 'lucide-react';
import { useCall } from '../context/CallContext';

export default function CallOverlay() {
  const c = useCall();
  const remoteRef = useRef(null);
  const localRef = useRef(null);

  useEffect(() => { if (remoteRef.current) remoteRef.current.srcObject = c.remoteStream; }, [c.remoteStream, c.status]);
  useEffect(() => { if (localRef.current) localRef.current.srcObject = c.localStream; }, [c.localStream, c.status]);
  // نخفض صوت المتكلم الأصلي عندما تكون الترجمة المنطوقة مفعّلة
  useEffect(() => { if (remoteRef.current) remoteRef.current.volume = c.translateOn && c.speakTranslation ? 0.25 : 1; }, [c.translateOn, c.speakTranslation, c.remoteStream, c.status]);

  if (c.status === 'idle') return null;
  const name = c.peerUser?.name || '';

  if (c.status === 'incoming') {
    return (
      <div className="call-overlay">
        <div className="call-box">
          <div className="call-avatar">{name.charAt(0)}</div>
          <h2>{name}</h2>
          {c.peerUser?.phone && <p className="ltr" style={{ opacity: 0.7, direction: 'ltr' }}>{c.peerUser.phone}</p>}
          <p style={{ opacity: 0.7 }}>{c.withVideo ? 'مكالمة فيديو واردة' : 'مكالمة صوتية واردة'} — ستُترجم تلقائياً</p>
          <div className="call-controls">
            <button className="btn round end" onClick={c.rejectCall} aria-label="رفض"><PhoneOff /></button>
            <button className="btn round accept" onClick={c.answerCall} aria-label="رد"><Phone /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="call-overlay">
      <div className="call-box">
        <div className="call-stage">
          {c.withVideo && c.remoteStream ? (
            <video ref={remoteRef} className="remote" autoPlay playsInline />
          ) : (
            <>
              <div className="call-avatar">{name.charAt(0)}</div>
              <audio ref={remoteRef} autoPlay />
            </>
          )}
          {c.withVideo && c.localStream && <video ref={localRef} className="local" autoPlay playsInline muted />}
          {c.translateOn && (
            <div className="captions">
              {c.captions.slice(-3).map((cap) => (
                <div key={cap.id} className={`caption${cap.mine ? ' mine' : ''}`}>{cap.text}</div>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <strong>{name}</strong>
          {c.peerUser?.phone && <span className="ltr" style={{ opacity: 0.6, direction: 'ltr' }}>{c.peerUser.phone}</span>}
          <span style={{ opacity: 0.7 }}>{c.status === 'calling' ? 'جارٍ الاتصال…' : 'متصل'}</span>
        </div>

        <div className="call-controls">
          <button className={`btn round${c.muted ? ' off' : ''}`} onClick={c.toggleMute} aria-label="كتم">{c.muted ? <MicOff /> : <Mic />}</button>
          {c.withVideo && (
            <button className={`btn round${!c.cameraOn ? ' off' : ''}`} onClick={c.toggleCamera} aria-label="الكاميرا">{c.cameraOn ? <Video /> : <VideoOff />}</button>
          )}
          <button className={`btn round${!c.translateOn ? ' off' : ''}`} onClick={() => c.setTranslateOn(!c.translateOn)} aria-label="الترجمة"><Languages /></button>
          <button className={`btn round${!c.speakTranslation ? ' off' : ''}`} onClick={() => c.setSpeakTranslation(!c.speakTranslation)} aria-label="نطق الترجمة">{c.speakTranslation ? <Volume2 /> : <VolumeX />}</button>
          <button className="btn round end" onClick={c.endCall} aria-label="إنهاء"><PhoneOff /></button>
        </div>
        <small style={{ opacity: 0.55 }}>للحصول على أفضل ترجمة صوتية استخدم سماعات لتجنب التقاط صوت الترجمة.</small>
      </div>
    </div>
  );
}
