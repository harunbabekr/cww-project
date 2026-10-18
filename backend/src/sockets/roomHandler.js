import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CallLog from '../models/CallLog.js';
import translationService from '../services/translationService.js';
import { synthesize } from '../services/ttsService.js';
import { notifyUser, pushAvailable } from '../services/pushService.js';
import { isOnline } from './presence.js';
import { roomOf, isBusy } from './state.js';

/*
 * مكالمات جماعية (صوت/فيديو) بتقنية Mesh: كل مشارك يتصل مباشرة بكل مشارك آخر (P2P).
 * الخادم يمرّر الإشارات فقط ويترجم الكلام لكل مشارك بلغته. مناسب حتى ~6 مشاركين.
 * القاعدة: الذي ينضم أخيراً هو الذي يرسل العروض (offer) لمن سبقه، فلا يحدث تعارض.
 */
const MAX = Math.min(Number(process.env.MAX_ROOM_SIZE) || 6, 8);
const INVITE_MS = 60000;
const GRACE_MS = 8000;
const rooms = new Map();

const log = (id, patch, extra = {}) => id && CallLog.updateOne({ _id: id }, { $set: patch, ...extra }).catch(() => {});

export default (io, socket) => {
  const me = socket.user;
  const to = (id, event, payload) => io.to(`user:${id}`).emit(event, payload);
  const toJoined = (room, event, payload, except) => {
    for (const id of room.joined.keys()) if (id !== except) to(id, event, payload);
  };
  const peersOf = (room, except) => [...room.joined].filter(([id]) => id !== except).map(([id, v]) => ({ id, name: v.name }));

  function closeRoom(room, reason) {
    if (!rooms.has(room.id)) return;
    rooms.delete(room.id);
    for (const [id, inv] of room.invited) { clearTimeout(inv.timer); to(id, 'room:closed', { roomId: room.id, reason }); }
    for (const id of room.joined.keys()) { roomOf.delete(id); to(id, 'room:closed', { roomId: room.id, reason }); }
    const now = new Date();
    const talked = room.answeredAt;
    log(room.logId, { status: talked ? 'completed' : 'missed', endedAt: now, duration: talked ? Math.round((now - talked) / 1000) : 0 });
  }

  function dropInvite(room, id, event) {
    const inv = room.invited.get(id);
    if (!inv) return false;
    clearTimeout(inv.timer);
    room.invited.delete(id);
    if (event) to(id, event, { roomId: room.id });
    return true;
  }

  function checkAlone(room, reason = 'no_answer') {
    if (room.joined.size <= 1 && room.invited.size === 0) closeRoom(room, room.joined.size === 1 && room.answeredAt ? 'alone' : reason);
  }

  async function invite(room, users) {
    let sent = 0;
    for (const u of users) {
      const id = String(u._id);
      if (room.joined.has(id) || room.invited.has(id) || isBusy(id)) continue;
      const online = isOnline(id);
      if (!online && !pushAvailable()) continue;
      const payload = { roomId: room.id, video: room.video, from: room.host, fromName: room.hostName, count: room.joined.size + room.invited.size + 1 };
      if (online) to(id, 'room:invite', payload);
      else if (!(await notifyUser(id, { type: 'call', title: `مكالمة جماعية ${room.video ? 'فيديو' : 'صوتية'} من ${room.hostName}`, body: 'اضغط للانضمام', url: '/calls', tag: `room:${room.id}`, requireInteraction: true }))) continue;
      const timer = setTimeout(() => {
        if (dropInvite(room, id, 'room:invite_expired')) checkAlone(room);
      }, INVITE_MS);
      room.invited.set(id, { name: u.name, timer });
      sent++;
    }
    return sent;
  }

  function leave(userId, roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.joined.has(userId)) return;
    const name = room.joined.get(userId).name;
    room.joined.delete(userId);
    roomOf.delete(userId);
    toJoined(room, 'room:peer_left', { roomId, user: { id: userId, name } });
    if (room.joined.size === 0) closeRoom(room, 'ended');
    else checkAlone(room, 'alone');
  }

  // دعوات لم يردّ عليها هذا المستخدم بعد (فتح التطبيق من الإشعار)
  for (const room of rooms.values()) {
    if (room.invited.has(me.id)) socket.emit('room:invite', { roomId: room.id, video: room.video, from: room.host, fromName: room.hostName, count: room.joined.size + room.invited.size });
  }

  socket.on('room:create', async ({ memberIds, video, name } = {}, ack) => {
    try {
      if (isBusy(me.id)) return ack?.({ ok: false, error: 'أنت في مكالمة أخرى بالفعل' });
      const ids = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(String))].filter((x) => mongoose.isValidObjectId(x) && x !== me.id);
      if (!ids.length) return ack?.({ ok: false, error: 'اختر مشاركاً واحداً على الأقل' });
      if (ids.length > MAX - 1) return ack?.({ ok: false, error: `الحد الأقصى ${MAX} مشاركين` });

      const users = await User.find({ _id: { $in: ids }, isActive: true, isVerified: true }).select('name');
      if (!users.length) return ack?.({ ok: false, error: 'المستخدمون غير موجودون' });

      const doc = await CallLog.create({ kind: 'group', video: !!video, from: me.id, participants: [me.id, ...users.map((u) => u._id)], joined: [me.id] });
      const room = {
        id: crypto.randomUUID(), host: me.id, hostName: me.name, video: !!video, name: String(name || '').slice(0, 60),
        joined: new Map([[me.id, { name: me.name }]]), invited: new Map(), logId: doc._id, answeredAt: null,
      };
      rooms.set(room.id, room);
      roomOf.set(me.id, room.id);

      const sent = await invite(room, users);
      if (!sent) { closeRoom(room, 'unreachable'); return ack?.({ ok: false, error: 'لا يمكن الوصول لأي من المشاركين الآن (غير متصلين أو مشغولون)' }); }
      ack?.({ ok: true, roomId: room.id, invited: sent });
    } catch {
      ack?.({ ok: false, error: 'تعذّر إنشاء المكالمة الجماعية' });
    }
  });

  socket.on('room:join', ({ roomId } = {}, ack) => {
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: 'انتهت المكالمة' });
    const already = room.joined.has(me.id);
    if (!already && !room.invited.has(me.id)) return ack?.({ ok: false, error: 'غير مصرح لك بالانضمام' });
    if (!already && (isBusy(me.id) || room.joined.size >= MAX)) return ack?.({ ok: false, error: room.joined.size >= MAX ? 'الغرفة ممتلئة' : 'أنت في مكالمة أخرى' });

    dropInvite(room, me.id);
    const peers = peersOf(room, me.id);
    room.joined.set(me.id, { name: me.name });
    roomOf.set(me.id, room.id);
    if (!room.answeredAt) room.answeredAt = new Date();
    log(room.logId, { status: 'answered', answeredAt: room.answeredAt }, { $addToSet: { joined: me.id } });
    toJoined(room, 'room:peer_joined', { roomId: room.id, user: { id: me.id, name: me.name } }, me.id);
    ack?.({ ok: true, video: room.video, peers });
  });

  socket.on('room:decline', ({ roomId } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !dropInvite(room, me.id)) return;
    toJoined(room, 'room:peer_declined', { roomId, user: { id: me.id, name: me.name } });
    checkAlone(room, 'declined');
  });

  socket.on('room:signal', ({ roomId, toUserId, signal } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !room.joined.has(me.id) || !room.joined.has(toUserId) || !signal) return;
    if (JSON.stringify(signal).length > 30000) return;
    to(toUserId, 'room:signal', { roomId, from: me.id, signal });
  });

  socket.on('room:leave', ({ roomId } = {}) => leave(me.id, roomId));

  socket.on('room:invite_more', async ({ roomId, memberIds } = {}, ack) => {
    try {
      const room = rooms.get(roomId);
      if (!room || !room.joined.has(me.id)) return ack?.({ ok: false, error: 'المكالمة غير متاحة' });
      const ids = [...new Set((memberIds || []).map(String))].filter((x) => mongoose.isValidObjectId(x));
      if (room.joined.size + room.invited.size + ids.length > MAX) return ack?.({ ok: false, error: `الحد الأقصى ${MAX} مشاركين` });
      const users = await User.find({ _id: { $in: ids }, isActive: true, isVerified: true }).select('name');
      const sent = await invite(room, users);
      await CallLog.updateOne({ _id: room.logId }, { $addToSet: { participants: { $each: users.map((u) => u._id) } } }).catch(() => {});
      ack?.({ ok: true, invited: sent });
    } catch {
      ack?.({ ok: false, error: 'تعذّرت الدعوة' });
    }
  });

  // ترجمة الكلام لكل مشارك بلغته (مرة واحدة لكل لغة)، بصوت المتكلم المستنسخ إن فعّله
  let rate = { t: Date.now(), n: 0 };
  socket.on('room:speech', async ({ roomId, text, language } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !room.joined.has(me.id) || !text || String(text).length > 600) return;
    if (Date.now() - rate.t > 60000) rate = { t: Date.now(), n: 0 };
    if (++rate.n > 40) return;
    try {
      const otherIds = [...room.joined.keys()].filter((id) => id !== me.id);
      if (!otherIds.length) return;
      const [others, sender] = await Promise.all([
        User.find({ _id: { $in: otherIds } }).select('settings'),
        User.findById(me.id).select('settings +voice.voiceId'),
      ]);
      const byLang = new Map();
      for (const u of others) {
        const l = u.settings.speakLanguage;
        if (!l || l === language) continue; // يفهم الأصل
        if (!byLang.has(l)) byLang.set(l, { ids: [], style: u.settings.translationStyle });
        byLang.get(l).ids.push(String(u._id));
      }
      const cloneId = sender?.settings?.voiceClone ? sender.voice?.voiceId : null;
      await Promise.all([...byLang].map(async ([lang, g]) => {
        try {
          const r = await translationService.translateText(text, language || 'auto', lang, { style: g.style });
          const audio = cloneId ? await synthesize({ text: r.translated, language: lang, cloneVoiceId: cloneId, userId: me.id }) : null;
          for (const id of g.ids) to(id, 'room:translation', { roomId, from: me.id, fromName: me.name, original: text, translated: r.translated, language: lang, audio });
        } catch { /* لغة واحدة فاشلة لا توقف البقية */ }
      }));
    } catch { /* تجاهل */ }
  });

  socket.on('disconnect', () => {
    setTimeout(() => {
      if (isOnline(me.id)) return;
      const id = roomOf.get(me.id);
      if (id) leave(me.id, id);
    }, GRACE_MS).unref?.();
  });
};
