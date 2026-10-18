import Conversation from '../models/Conversation.js';
import { saveAndTranslateMessage } from '../services/chatService.js';
import { notifyUser } from '../services/pushService.js';

export default (io, socket) => {
  socket.on('chat:join', async (conversationId, ack) => {
    try {
      const ok = await Conversation.exists({ _id: conversationId, members: socket.user.id });
      if (!ok) return ack?.({ ok: false, error: 'غير مصرح' });
      socket.join(`conv:${conversationId}`);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'معرّف غير صالح' });
    }
  });

  socket.on('chat:leave', (conversationId) => socket.leave(`conv:${conversationId}`));

  socket.on('chat:send', async ({ conversationId, text, language }, ack) => {
    try {
      const { message, recipients, senderName, conversationName } = await saveAndTranslateMessage({
        conversationId, senderId: socket.user.id, text, sourceLanguage: language,
      });
      io.to(`conv:${conversationId}`).emit('chat:message', message);
      // إشعار لمن لا يشاهد المحادثة حالياً (التطبيق مغلق أو في صفحة أخرى)
      for (const r of recipients) {
        const watching = (await io.in(`conv:${conversationId}`).fetchSockets()).some((s) => s.user.id === r.id);
        if (!watching) {
          notifyUser(r.id, { type: 'chat', title: conversationName, body: `${senderName}: ${(message.translations[r.lang] || message.originalText).slice(0, 100)}`, url: '/chat', tag: `chat:${conversationId}` });
        }
      }
      ack?.({ ok: true, message });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    socket.to(`conv:${conversationId}`).emit('chat:typing', { conversationId, userId: socket.user.id, name: socket.user.name, isTyping: !!isTyping });
  });
};
