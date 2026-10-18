import User from '../models/User.js';
import CallLog from '../models/CallLog.js';
import translationService from '../services/translationService.js';
import { synthesize } from '../services/ttsService.js';
import { notifyUser, pushAvailable } from '../services/pushService.js';
import { isOnline } from './presence.js';
import { ringing as pending, directCalls, isBusy } from './state.js';

const RING_MS = 45000;
const GRACE_MS = 8000; // انقطاع مؤقت للشبكة لا يُنهي المكالمة

export default (io, socket) => {
  const me = socket.user;
  const emitTo = (userId, event, payload = {}) => io.to(`user:${userId}`).emit(event, { ...payload, from: me.id, fromName: me.name, fromPhone: me.phone });
  const log = (id, patch) => id && CallLog.updateOne({ _id: id }, { $set: patch }).catch(() => {});
  const missedPush = (calleeId, fromName) => notifyUser(calleeId, { type: 'missed', title: 'مكالمة فائتة', body: `من ${fromName}`, url: '/calls', tag: 'missed' }).catch(() => {});

  /** إنهاء مكالمة قائمة: يعيد معرّف الطرف الآخر */
  const finishActive = (userId, status = 'completed') => {
    const a = directCalls.get(userId);
    if (!a) return null;
    directCalls.delete(userId);
    directCalls.delete(a.peer);
    const now = new Date();
    log(a.logId, { status, endedAt: now, duration: Math.max(0, Math.round((now - a.answeredAt) / 1000)) });
    return a.peer;
  };

  /** إنهاء رنين: outcome = answered | rejected | missed | cancelled */
  const clearPending = (calleeId, outcome) => {
    const p = pending.get(calleeId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(calleeId);

    if (outcome === 'answered') {
      const answeredAt = new Date();
      directCalls.set(calleeId, { peer: p.from, logId: p.logId, answeredAt });
      directCalls.set(p.from, { peer: calleeId, logId: p.logId, answeredAt });
      log(p.logId, { status: 'answered', answeredAt });
      return;
    }
    log(p.logId, { status: outcome, endedAt: new Date() });
    if (outcome === 'missed') {
      io.to(`user:${p.from}`).emit('call:rejected', { reason: 'no_answer', from: calleeId });
      io.to(`user:${calleeId}`).emit('call:ended', { from: p.from });
      missedPush(calleeId, p.fromName);
    } else if (outcome === 'cancelled') {
      io.to(`user:${calleeId}`).emit('call:ended', { from: p.from });
      missedPush(calleeId, p.fromName);
    }
  };

  // تسليم مكالمة كانت تنتظر هذا المستخدم (فتح التطبيق من الإشعار)
  const waiting = pending.get(me.id);
  if (waiting && !waiting.delivered) {
    waiting.delivered = true;
    socket.emit('call:incoming', { from: waiting.from, fromName: waiting.fromName, fromPhone: waiting.fromPhone, signalData: waiting.signalData, video: waiting.video });
    waiting.ice.forEach((candidate) => socket.emit('call:ice_candidate', { from: waiting.from, candidate }));
  }

  socket.on('call:initiate', async ({ toUserId, signalData, video }, ack) => {
    try {
      if (!toUserId || toUserId === me.id) return ack?.({ ok: false, error: 'مستخدم غير صالح' });
      if (isBusy(me.id)) return ack?.({ ok: false, error: 'أنت في مكالمة أخرى بالفعل' });

      const target = await User.findOne({ _id: toUserId, isActive: true, isVerified: true }).select('_id');
      if (!target) return ack?.({ ok: false, error: 'المستخدم غير موجود' });

      const doc = await CallLog.create({ kind: 'direct', video: !!video, from: me.id, to: toUserId, participants: [me.id, toUserId] });

      if (isBusy(toUserId)) {
        log(doc._id, { status: 'failed', endedAt: new Date() });
        return ack?.({ ok: false, error: 'المستخدم مشغول بمكالمة أخرى' });
      }

      const online = isOnline(toUserId);
      if (!online && !pushAvailable()) {
        log(doc._id, { status: 'missed', endedAt: new Date() });
        return ack?.({ ok: false, error: 'المستخدم غير متصل حالياً. ستظهر له مكالمة فائتة منك.' });
      }

      const p = { from: me.id, fromName: me.name, fromPhone: me.phone, signalData, video: !!video, ice: [], delivered: online, logId: doc._id };
      p.timer = setTimeout(() => clearPending(toUserId, 'missed'), RING_MS);
      pending.set(toUserId, p);

      if (online) emitTo(toUserId, 'call:incoming', { signalData, video: !!video });
      else {
        const sent = await notifyUser(toUserId, { type: 'call', title: `مكالمة ${video ? 'فيديو' : 'صوتية'} من ${me.name}`, body: 'اضغط للرد', url: '/calls', tag: 'call', requireInteraction: true });
        if (!sent) {
          clearTimeout(p.timer); pending.delete(toUserId);
          log(doc._id, { status: 'missed', endedAt: new Date() });
          return ack?.({ ok: false, error: 'المستخدم غير متصل ولم يفعّل الإشعارات. ستظهر له مكالمة فائتة منك.' });
        }
      }
      ack?.({ ok: true, via: online ? 'socket' : 'push' });
    } catch (e) {
      ack?.({ ok: false, error: 'تعذّر بدء المكالمة' });
    }
  });

  socket.on('call:answer', ({ toUserId, signalData }) => {
    const p = pending.get(me.id);
    if (!p || p.from !== toUserId) return;
    clearPending(me.id, 'answered');
    emitTo(toUserId, 'call:accepted', { signalData });
  });

  socket.on('call:reject', ({ toUserId }) => {
    const p = pending.get(me.id);
    if (p && p.from === toUserId) clearPending(me.id, 'rejected');
    emitTo(toUserId, 'call:rejected', { reason: 'rejected' });
  });

  socket.on('call:ice_candidate', ({ toUserId, candidate }) => {
    const p = pending.get(toUserId);
    if (p && p.from === me.id) p.ice.push(candidate); // لم يرد بعد: نحفظ المرشحات
    emitTo(toUserId, 'call:ice_candidate', { candidate });
  });

  socket.on('call:end', ({ toUserId }) => {
    const outgoing = pending.get(toUserId);
    const incoming = pending.get(me.id);
    if (outgoing && outgoing.from === me.id) clearPending(toUserId, 'cancelled'); // المتصل ألغى قبل الرد
    else if (incoming && incoming.from === toUserId) clearPending(me.id, 'rejected');
    else finishActive(me.id);
    emitTo(toUserId, 'call:ended');
  });

  // ترجمة كلام أثناء المكالمة، بصوت المتكلم المستنسخ إن فعّله
  let rate = { t: Date.now(), n: 0 };
  socket.on('call:speech', async ({ toUserId, text, language }) => {
    if (directCalls.get(me.id)?.peer !== toUserId) return; // فقط أثناء مكالمة قائمة
    if (Date.now() - rate.t > 60000) rate = { t: Date.now(), n: 0 };
    if (++rate.n > 40 || !text || String(text).length > 600) return;
    try {
      const [peer, sender] = await Promise.all([
        User.findById(toUserId).select('settings'),
        User.findById(me.id).select('settings +voice.voiceId'),
      ]);
      if (!peer) return;
      const to = peer.settings.speakLanguage;
      if (language && language === to) return; // يفهم لغته الأصلية، لا حاجة لترجمة (تمنع تكرار الصوت)
      const r = await translationService.translateText(text, language || 'auto', to, { style: peer.settings.translationStyle });
      const cloneId = sender?.settings?.voiceClone ? sender.voice?.voiceId : null;
      const audio = cloneId ? await synthesize({ text: r.translated, language: to, cloneVoiceId: cloneId, userId: me.id }) : null;
      emitTo(toUserId, 'call:translation', { original: text, translated: r.translated, language: to, audio });
    } catch { /* نتجاهل الأخطاء العابرة كي لا تنقطع المكالمة */ }
  });

  socket.on('disconnect', () => {
    // مهلة قصيرة: قد يكون انقطاعاً مؤقتاً في الشبكة (شائع على بيانات الجوال)
    setTimeout(() => {
      if (isOnline(me.id)) return;
      for (const [calleeId, p] of pending) if (p.from === me.id) { clearPending(calleeId, 'cancelled'); emitTo(calleeId, 'call:ended'); }
      const peer = finishActive(me.id);
      if (peer) emitTo(peer, 'call:ended');
    }, GRACE_MS).unref?.();
  });
};
