import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';
import { CallPeer } from '../services/webrtc';
import { createUtteranceRecorder, sendAudio } from '../lib/recorder';
import { createRecognizer, browserSpeechSupported } from '../lib/browserSpeech';
import { say, isPlaying, stopAll } from '../lib/audio';
import { startRing, stopRing } from '../lib/ringtone';
import { useFeatures } from '../lib/features';
import { setBusy, isBusy, keepAwake } from '../lib/callBusy';

const CallContext = createContext(null);
const REASONS = { rejected: 'رفض المستخدم المكالمة', no_answer: 'لم يردّ المستخدم' };

export function CallProvider({ children }) {
  const { socket, user } = useAuth();
  const features = useFeatures();

  const [status, setStatus] = useState('idle'); // idle | calling | incoming | active
  const [peerUser, setPeerUser] = useState(null); // { id, name, phone }
  const [withVideo, setWithVideo] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [translateOn, setTranslateOn] = useState(true);
  const [speakTranslation, setSpeakTranslation] = useState(true);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState('');

  const peerRef = useRef(null);
  const incomingRef = useRef(null);
  const iceBuffer = useRef([]);
  const peerIdRef = useRef(null);
  const speakRef = useRef(true);
  const mutedRef = useRef(false);
  const settingsRef = useRef(user?.settings);
  speakRef.current = speakTranslation;
  mutedRef.current = muted;
  settingsRef.current = user?.settings;

  useEffect(() => { setBusy('call', status !== 'idle' && status !== 'incoming'); keepAwake(status === 'active'); }, [status]);

  const addCaption = (c) => setCaptions((prev) => [...prev.slice(-5), { id: crypto.randomUUID(), ...c }]);

  const cleanup = useCallback(() => {
    stopRing();
    stopAll();
    peerRef.current?.close();
    peerRef.current = null;
    incomingRef.current = null;
    iceBuffer.current = [];
    peerIdRef.current = null;
    setStatus('idle');
    setPeerUser(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCaptions([]);
    setMuted(false);
    setCameraOn(true);
  }, []);

  const buildPeer = useCallback(async (toUserId) => {
    let iceServers = [];
    try { iceServers = (await api.get('/meta/ice')).data.iceServers; } catch { /* STUN الافتراضي */ }
    return new CallPeer({
      iceServers,
      onRemoteStream: setRemoteStream,
      onIceCandidate: (candidate) => socket?.emit('call:ice_candidate', { toUserId, candidate }),
      onConnectionState: (s) => {
        if (s === 'failed') { setError('انقطع الاتصال (قد تحتاج خادم TURN)'); cleanup(); }
      },
    });
  }, [socket, cleanup]);

  // ----- أحداث الإشارة -----
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = (d) => {
      if (peerIdRef.current || incomingRef.current || isBusy('room')) { socket.emit('call:reject', { toUserId: d.from }); return; }
      incomingRef.current = d;
      iceBuffer.current = [];
      setPeerUser({ id: d.from, name: d.fromName, phone: d.fromPhone });
      setWithVideo(!!d.video);
      setStatus('incoming');
      startRing();
    };
    const onAccepted = async ({ signalData }) => {
      try { await peerRef.current?.handleAnswer(signalData); setStatus('active'); }
      catch { setError('فشل إتمام المكالمة'); cleanup(); }
    };
    const onIce = ({ candidate, from }) => {
      if (peerRef.current && peerIdRef.current === from) peerRef.current.addIce(candidate);
      else iceBuffer.current.push(candidate);
    };
    const onRejected = ({ reason }) => { setError(REASONS[reason] || 'انتهت المكالمة'); cleanup(); };
    const onTranslation = ({ original, translated, language, audio }) => {
      addCaption({ mine: false, text: translated, original });
      if (speakRef.current) say({ text: translated, lang: language, audio });
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:ice_candidate', onIce);
    socket.on('call:ended', cleanup);
    socket.on('call:rejected', onRejected);
    socket.on('call:translation', onTranslation);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:ice_candidate', onIce);
      socket.off('call:ended', cleanup);
      socket.off('call:rejected', onRejected);
      socket.off('call:translation', onTranslation);
    };
  }, [socket, cleanup]);

  // ----- بدء / رد / رفض / إنهاء -----
  const startCall = useCallback(async (target, video) => {
    if (status !== 'idle' || !socket) return;
    if (isBusy('room')) { setError('أنت في مكالمة جماعية الآن'); return; }
    setError('');
    try {
      setPeerUser(target);
      setWithVideo(video);
      setStatus('calling');
      peerIdRef.current = target.id;
      const peer = await buildPeer(target.id);
      peerRef.current = peer;
      setLocalStream(await peer.start(video));
      const offer = await peer.createOffer();
      socket.emit('call:initiate', { toUserId: target.id, signalData: offer, video }, (res) => {
        if (!res?.ok) { setError(res?.error || 'تعذّر الاتصال'); cleanup(); }
      });
    } catch {
      setError('لم نتمكن من الوصول إلى الميكروفون/الكاميرا');
      cleanup();
    }
  }, [status, socket, buildPeer, cleanup]);

  const answerCall = useCallback(async () => {
    const d = incomingRef.current;
    if (!d) return;
    stopRing();
    try {
      peerIdRef.current = d.from;
      const peer = await buildPeer(d.from);
      peerRef.current = peer;
      setLocalStream(await peer.start(!!d.video));
      const answer = await peer.acceptOffer(d.signalData);
      for (const c of iceBuffer.current.splice(0)) await peer.addIce(c);
      socket.emit('call:answer', { toUserId: d.from, signalData: answer });
      incomingRef.current = null;
      setStatus('active');
    } catch {
      setError('لم نتمكن من الوصول إلى الميكروفون/الكاميرا');
      socket.emit('call:reject', { toUserId: d.from });
      cleanup();
    }
  }, [buildPeer, socket, cleanup]);

  const rejectCall = useCallback(() => {
    if (incomingRef.current) socket.emit('call:reject', { toUserId: incomingRef.current.from });
    cleanup();
  }, [socket, cleanup]);

  const endCall = useCallback(() => {
    const to = peerIdRef.current || incomingRef.current?.from;
    if (to) socket?.emit('call:end', { toUserId: to });
    cleanup();
  }, [socket, cleanup]);

  const toggleMute = () => { peerRef.current?.setMuted(!muted); setMuted(!muted); };
  const toggleCamera = () => { peerRef.current?.setCameraOn(!cameraOn); setCameraOn(!cameraOn); };

  // ----- التعرف على كلامي وإرساله ليُترجم عند الطرف الآخر -----
  useEffect(() => {
    if (status !== 'active' || !translateOn || !socket || !localStream) return undefined;
    const lang = settingsRef.current?.speakLanguage || 'ar';
    const send = (text) => {
      if (!text || mutedRef.current) return;
      socket.emit('call:speech', { toUserId: peerIdRef.current, text, language: lang });
      addCaption({ mine: true, text });
    };

    if (features.stt?.available) {
      const rec = createUtteranceRecorder(localStream, {
        isPaused: () => isPlaying() || mutedRef.current,
        onUtterance: async ({ blob, mime }) => {
          try {
            const { data } = await sendAudio(api, '/translate/stt', blob, mime, { language: lang });
            send(data.data.text);
          } catch { /* جملة واحدة فاشلة لا توقف المكالمة */ }
        },
      });
      return () => rec.stop();
    }

    if (browserSpeechSupported) {
      let alive = true;
      const rec = createRecognizer({ lang, continuous: true, onFinal: send, onEnd: () => alive && rec?.start() });
      rec?.start();
      return () => { alive = false; rec?.stop(); };
    }
    return undefined;
  }, [status, translateOn, socket, localStream, features.stt?.available]);

  const value = useMemo(() => ({
    status, peerUser, withVideo, localStream, remoteStream, captions, translateOn, speakTranslation, muted, cameraOn, error,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleCamera, setTranslateOn, setSpeakTranslation,
    clearError: () => setError(''),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [status, peerUser, withVideo, localStream, remoteStream, captions, translateOn, speakTranslation, muted, cameraOn, error, startCall, answerCall, rejectCall, endCall]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCall = () => useContext(CallContext);
