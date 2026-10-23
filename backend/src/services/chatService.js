import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import translationService from './translationService.js';
import { AppError } from '../middlewares/errorHandler.js';

const toPayload = (m) => ({
  id: m._id,
  conversation: m.conversation,
  sender: m.sender,
  originalText: m.originalText,
  sourceLanguage: m.sourceLanguage,
  translations: m.translations instanceof Map ? Object.fromEntries(m.translations) : m.translations || {},
  createdAt: m.createdAt,
});

/**
 * يحفظ الرسالة ويترجمها إلى لغة كل عضو (مرة واحدة لكل لغة).
 * يعيد { message, recipients:[{id, lang}], senderName, conversationName }
 */
export async function saveAndTranslateMessage({ conversationId, senderId, text, sourceLanguage }) {
  if (!mongoose.isValidObjectId(conversationId)) throw new AppError('معرّف المحادثة غير صالح', 400);
  const clean = String(text || '').trim();
  if (!clean) throw new AppError('الرسالة فارغة', 400);

  const conv = await Conversation.findOne({ _id: conversationId, members: senderId });
  if (!conv) throw new AppError('المحادثة غير موجودة', 404);

  const members = await User.find({ _id: { $in: conv.members } }).select('name settings');
  const sender = members.find((m) => String(m._id) === String(senderId));

  const from = sourceLanguage || sender.settings.speakLanguage || 'auto';
  const targets = [...new Set(members.map((m) => m.settings.speakLanguage))].filter((l) => l && l !== from);

  const translations = {};
  await Promise.all(
    targets.map(async (lang) => {
      const style = members.some((m) => m.settings.speakLanguage === lang && m.settings.translationStyle !== 'standard') ? 'colloquial' : 'standard';
      try { translations[lang] = (await translationService.translateText(clean, from, lang, { style })).translated; }
      catch { /* فشل لغة واحدة لا يمنع الإرسال */ }
    })
  );

  const message = await Message.create({ conversation: conv._id, sender: senderId, originalText: clean, sourceLanguage: from, translations });
  conv.lastMessage = clean.slice(0, 120);
  conv.lastMessageAt = new Date();
  conv.lastSender = senderId;
  await conv.save();

  return {
    message: toPayload(message),
    senderName: sender.name,
    conversationName: conv.isGroup ? conv.name : sender.name,
    memberIds: members.map((m) => String(m._id)),
    recipients: members.filter((m) => String(m._id) !== String(senderId)).map((m) => ({ id: String(m._id), lang: m.settings.speakLanguage })),
  };
}
