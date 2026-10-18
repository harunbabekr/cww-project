import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';
import { MeshRoom } from '../services/mesh';
import { say, stopAll } from '../lib/audio';
import { startRing, stopRing } from '../lib/ringtone';
import { useFeatures } from '../lib/features';
import { useSpeechCapture } from '../lib/useSpeechCapture';
import { setBusy, isBusy, keepAwake } from '../lib/callBusy';

const RoomContext = createContext(null);
const CLOSE_MSG = {
  no_answer: 'لم ينضم أحد إلى المكالمة', declined: 'رفض المدعوون المكالمة', unreachable: 'تعذّر الوصول إلى المشاركين',
  alone: 'غادر جميع المشاركين', ended: 'انتهت المكالمة',
};

export function RoomProvider({ children }) {
  const { socket, user } = useAuth();
  const features = useFeatures();

  const [status, setStatus] = useState('idle'); // idle | starting | active | incoming
  const [room, setRoom] = useState(null); // { id, video }
  const [invite, setInvite] = useState(null);
  const [people, setPeople] = useState({}); // id -> { id, name, stream, state }
  const [localStream, setLocalStream] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [translateOn, setTranslateOn] = useState(true);
  const [speakTranslation, setSpeakTranslation] = useState(true);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [notice, setNotice] = useState('');

  const meshRef = useRef(null);
  const roomRef = useRef(null);
  const inviteRef = useRef(null);
  const speakRef = useRef(true);
  const mutedRef = useRef(false);
  speakRef.current = speakTranslation;
  mutedRef.current = muted;
  roomRef.current = room;
  inviteRef.current = invite;

  const addCaption = (c) => setCaptions((p) => [...p.slice(-6), { id: crypto.randomUUID(), ...c }]);

  const cleanup = useCallback((msg = '') => {
    stopRing(); stopAll();
    meshRef.current?.close();
    meshRef.current = null;
    setStatus('idle'); setRoom(null); setInvite(null); setPeople({}); setLocalStream(null);
    setCaptions([]); setMuted(false); setCameraOn(true);
    if (msg) setNotice(msg);
  }, []);

  useEffect(() => { setBusy('room', status !== 'idle' && status !== 'incoming'); keepAwake(status === 'active'); }, [status]);

  const buildMesh = useCallback(async () => {
    let iceServers = [];
    try { iceServers = (await api.get('/meta/ice')).data.iceServers; } catch { /* STUN افتراضي */ }
    return new MeshRoom({
      iceServers,
      onStream: (id, stream) => setPeople((p) => ({ ...p, [id]: { ...(p[id] || { id, name: '…' }), stream } })),
      onSignal: (toUserId, signal) => socket?.emit('room:signal', { roomId: roomRef.current?.id || inviteRef.current?.roomId, toUserId, signal }),
      onState: (id, state) => setPeople((p) => (p[id] ? { ...p, [id]: { ...p[id], state } } : p)),
    });
  }, [socket]);

  // ---- أحداث الغرفة ----
  useEffect(() => {
    if (!socket) return undefined;
    const on = {
      'room:invite': (d) => {
        if (isBusy('call') || isBusy('room') || inviteRef.current) { socket.emit('room:decline', { roomId: d.roomId }); return; }
        setInvite(d); setStatus('incoming'); startRing();
      },
      'room:invite_expired': ({ roomId }) => {
        if (inviteRef.current?.roomId === roomId) { stopRing(); setInvite(null); setStatus('idle'); }
      },
      'room:peer_joined': ({ roomId, user: u }) => {
        if (roomRef.current?.id !== roomId) return;
        setPeople((p) => ({ ...p, [u.id]: { ...(p[u.id] || {}), id: u.id, name: u.name } }));
        addCaption({ system: true, text: `${u.name} انضم` });
      },
      'room:peer_left': ({ roomId, user: u }) => {
        if (roomRef.current?.id !== roomId) return;
        meshRef.current?.remove(u.id);
        setPeople((p) => { const n = { ...p }; delete n[u.id]; return n; });
        addCaption({ system: true, text: `${u.name} غادر` });
      },
      'room:peer_declined': ({ user: u }) => addCaption({ system: true, text: `${u.name} رفض الانضمام` }),
      'room:signal': ({ roomId, from, signal }) => { if (roomRef.current?.id === roomId) meshRef.current?.handle(from, signal); },
      'room:closed': ({ roomId, reason }) => {
        if (roomRef.current?.id === roomId || inviteRef.current?.roomId === roomId) cleanup(CLOSE_MSG[reason] || 'انتهت المكالمة');
      },
      'room:translation': ({ roomId, fromName, original, translated, language, audio }) => {
        if (roomRef.current?.id !== roomId) return;
        addCaption({ name: fromName, text: translated, original });
        if (speakRef.current) say({ text: translated, lang: language, audio });
      },
    };
    for (const [k, v] of Object.entries(on)) socket.on(k, v);
    return () => { for (const [k, v] of Object.entries(on)) socket.off(k, v); };
  }, [socket, cleanup]);

  // ---- بدء / قبول / رفض / مغادرة / دعوة المزيد ----
  const startRoom = useCallback(async (memberIds, video) => {
    if (!socket || status !== 'idle' || isBusy('call')) return;
    setNotice(''); setStatus('starting');
    try {
      const mesh = await buildMesh();
      meshRef.current = mesh;
      setLocalStream(await mesh.start(video));
      socket.emit('room:create', { memberIds, video }, (res) => {
        if (!res?.ok) { cleanup(res?.error || 'تعذّر بدء المكالمة'); return; }
        setRoom({ id: res.roomId, video });
        roomRef.current = { id: res.roomId, video };
        setStatus('active');
      });
    } catch { cleanup('لم نتمكن من الوصول إلى الميكروفون/الكاميرا'); }
  }, [socket, status, buildMesh, cleanup]);

  const acceptInvite = useCallback(async () => {
    const d = inviteRef.current;
    if (!d) return;
    stopRing();
    try {
      roomRef.current = { id: d.roomId, video: d.video };
      const mesh = await buildMesh();
      meshRef.current = mesh;
      setLocalStream(await mesh.start(d.video));
      socket.emit('room:join', { roomId: d.roomId }, async (res) => {
        if (!res?.ok) { cleanup(res?.error || 'تعذّر الانضمام'); return; }
        setRoom({ id: d.roomId, video: res.video });
        setInvite(null);
        setPeople(Object.fromEntries(res.peers.map((p) => [p.id, { id: p.id, name: p.name }])));
        setStatus('active');
        for (const p of res.peers) mesh.call(p.id);
      });
    } catch {
      socket.emit('room:decline', { roomId: d.roomId });
      cleanup('لم نتمكن من الوصول إلى الميكروفون/الكاميرا');
    }
  }, [socket, buildMesh, cleanup]);

  const declineInvite = useCallback(() => {
    if (inviteRef.current) socket.emit('room:decline', { roomId: inviteRef.current.roomId });
    cleanup();
  }, [socket, cleanup]);

  const leave = useCallback(() => {
    if (roomRef.current) socket?.emit('room:leave', { roomId: roomRef.current.id });
    cleanup();
  }, [socket, cleanup]);

  const inviteMore = useCallback((memberIds) => new Promise((resolve) => {
    socket.emit('room:invite_more', { roomId: roomRef.current?.id, memberIds }, (res) => resolve(res));
  }), [socket]);

  const toggleMute = () => { meshRef.current?.setMuted(!muted); setMuted(!muted); };
  const toggleCamera = () => { meshRef.current?.setCameraOn(!cameraOn); setCameraOn(!cameraOn); };

  // كلامي يُرسل ليُترجم لكل مشارك بلغته
  const lang = user?.settings?.speakLanguage || 'ar';
  useSpeechCapture({
    enabled: status === 'active' && translateOn && !!localStream,
    stream: localStream, lang, mutedRef, serverStt: !!features.stt?.available,
    onText: (text, l) => { socket?.emit('room:speech', { roomId: roomRef.current?.id, text, language: l }); addCaption({ mine: true, text }); },
  });

  const value = useMemo(() => ({
    status, room, invite, people, localStream, captions, translateOn, speakTranslation, muted, cameraOn, notice,
    startRoom, acceptInvite, declineInvite, leave, inviteMore, toggleMute, toggleCamera, setTranslateOn, setSpeakTranslation,
    clearNotice: () => setNotice(''),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [status, room, invite, people, localStream, captions, translateOn, speakTranslation, muted, cameraOn, notice, startRoom, acceptInvite, declineInvite, leave, inviteMore]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useRoom = () => useContext(RoomContext);
