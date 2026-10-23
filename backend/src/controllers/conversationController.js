import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import { saveAndTranslateMessage } from '../services/chatService.js';
import { linkUsers } from '../services/contactService.js';
import { isOnline } from '../sockets/presence.js';

const MEMBER_FIELDS = 'name fullPhone settings.speakLanguage';

const isId = (v) => mongoose.isValidObjectId(v);

const shapeConversation = (c, meId) => ({
  id: c._id,
  isGroup: c.isGroup,
  name: c.isGroup ? c.name : c.members.find((m) => String(m._id) !== String(meId))?.name || 'مستخدم',
  members: c.members.map((m) => ({ id: m._id, name: m.name, phone: m.fullPhone, speakLanguage: m.settings?.speakLanguage, online: isOnline(String(m._id)) })),
  lastMessage: c.lastMessage,
  lastMessageAt: c.lastMessageAt,
  lastSender: c.lastSender,
});

// POST /conversations { userId } أو { memberIds: [], name } لمجموعة
export const createConversation = async (req, res) => {
  const { userId, memberIds, name } = req.body;
  const me = req.user._id;

  let conv;
  if (userId) {
    if (!isId(userId) || String(userId) === String(me)) throw new AppError('معرّف غير صالح', 400);
    if (!(await User.exists({ _id: userId }))) throw new AppError('المستخدم غير موجود', 404);
    conv = await Conversation.findOne({ isGroup: false, members: { $all: [me, userId], $size: 2 } });
    if (!conv) conv = await Conversation.create({ members: [me, userId] });
    await linkUsers(me, userId); // الطرف الآخر يصبح جهة اتصال تلقائياً
  } else if (Array.isArray(memberIds) && memberIds.length >= 2) {
    if (!name?.trim()) throw new AppError('اسم المجموعة مطلوب', 400);
    const ids = [...new Set([String(me), ...memberIds.map(String)])].filter(isId);
    const count = await User.countDocuments({ _id: { $in: ids } });
    if (count !== ids.length) throw new AppError('بعض الأعضاء غير موجودين', 404);
    conv = await Conversation.create({ members: ids, isGroup: true, name: name.trim() });
  } else {
    throw new AppError('حدد مستخدماً أو أعضاء المجموعة', 400);
  }

  await conv.populate('members', MEMBER_FIELDS);
  res.status(201).json({ success: true, conversation: shapeConversation(conv, me) });
};

export const listConversations = async (req, res) => {
  const items = await Conversation.find({ members: req.user._id }).populate('members', MEMBER_FIELDS).sort({ lastMessageAt: -1 });
  res.json({ success: true, conversations: items.map((c) => shapeConversation(c, req.user._id)) });
};

// GET /conversations/:id/messages?before=ISO&limit=
export const getMessages = async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) throw new AppError('معرّف غير صالح', 400);
  const conv = await Conversation.findOne({ _id: id, members: req.user._id });
  if (!conv) throw new AppError('المحادثة غير موجودة', 404);

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const filter = { conversation: id };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  const msgs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, messages: msgs.reverse().map(shapeMessage) });
};

// POST /conversations/:id/messages { text }  (بديل REST عن السوكت)
export const sendMessage = async (req, res) => {
  const { message } = await saveAndTranslateMessage({
    conversationId: req.params.id,
    senderId: req.user._id,
    text: req.body.text,
    sourceLanguage: req.body.language,
  });
  res.status(201).json({ success: true, message });
};

export const shapeMessage = (m) => ({
  id: m._id,
  conversation: m.conversation,
  sender: m.sender,
  originalText: m.originalText,
  sourceLanguage: m.sourceLanguage,
  translations: m.translations instanceof Map ? Object.fromEntries(m.translations) : m.translations || {},
  createdAt: m.createdAt,
});

// POST /conversations/:id/members { userIds } — إضافة أعضاء لمجموعة
export const addMembers = async (req, res) => {
  const conv = await Conversation.findOne({ _id: req.params.id, isGroup: true, members: req.user._id });
  if (!conv) throw new AppError('المجموعة غير موجودة', 404);
  const ids = [...new Set((req.body.userIds || []).map(String))].filter(isId);
  const users = await User.find({ _id: { $in: ids }, isActive: true, isVerified: true }).select('_id');
  if (conv.members.length + users.length > 50) throw new AppError('تجاوزت الحد الأقصى لأعضاء المجموعة (50)', 400);
  await Conversation.updateOne({ _id: conv._id }, { $addToSet: { members: { $each: users.map((u) => u._id) } } });
  const fresh = await Conversation.findById(conv._id).populate('members', MEMBER_FIELDS);
  res.json({ success: true, conversation: shapeConversation(fresh, req.user._id) });
};

// POST /conversations/:id/leave
export const leaveGroup = async (req, res) => {
  const conv = await Conversation.findOne({ _id: req.params.id, isGroup: true, members: req.user._id });
  if (!conv) throw new AppError('المجموعة غير موجودة', 404);
  await Conversation.updateOne({ _id: conv._id }, { $pull: { members: req.user._id } });
  res.json({ success: true });
};
