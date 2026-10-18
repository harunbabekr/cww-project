import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import User from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import { linkUsers, shapeContact } from '../services/contactService.js';
import { normalizePhone } from '../utils/phone.js';
import { isOnline } from '../sockets/presence.js';

const isId = (v) => mongoose.isValidObjectId(v);
const POPULATE = 'name fullPhone settings';
const live = { isVerified: true, isActive: true };

const notifyAdded = (req, target) =>
  req.app.get('io')?.to(`user:${target._id}`).emit('contact:added', { id: String(req.user._id), name: req.user.name, phone: req.user.fullPhone });

export const listContacts = async (req, res) => {
  const items = await Contact.find({ owner: req.user._id }).populate('contact', POPULATE).sort({ createdAt: -1 });
  res.json({ success: true, contacts: items.filter((c) => c.contact).map((c) => shapeContact(c, isOnline)) });
};

// POST /contacts { userId | phone | email, nickname? } — الإضافة متبادلة تلقائياً
export const addContact = async (req, res) => {
  const { userId, phone, email, nickname } = req.body;
  let target = null;
  if (userId) {
    if (!isId(userId)) throw new AppError('معرّف غير صالح', 400);
    target = await User.findOne({ _id: userId, ...live });
  } else if (phone) {
    const full = normalizePhone(phone, req.user.countryCode);
    target = full ? await User.findOne({ fullPhone: full, ...live }) : null;
  } else if (email) {
    target = await User.findOne({ email: String(email).toLowerCase().trim(), ...live });
  } else {
    throw new AppError('حدد المستخدم المراد إضافته', 400);
  }
  if (!target) throw new AppError('لا يوجد مستخدم بهذه البيانات على التطبيق. أرسل له رابط دعوة ليسجّل.', 404);
  if (String(target._id) === String(req.user._id)) throw new AppError('لا يمكنك إضافة نفسك', 400);

  const { createdForOther } = await linkUsers(req.user._id, target._id, { nickname: nickname?.trim() || undefined });
  if (createdForOther) notifyAdded(req, target);

  const doc = await Contact.findOne({ owner: req.user._id, contact: target._id }).populate('contact', POPULATE);
  res.status(201).json({ success: true, contact: shapeContact(doc, isOnline) });
};

// POST /contacts/bulk { userIds: [] } — إضافة عدة جهات دفعة واحدة (بعد المطابقة مع جهات الهاتف)
export const addMany = async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))].filter(isId).slice(0, 200);
  const targets = await User.find({ _id: { $in: ids, $ne: req.user._id }, ...live }).select('_id');
  for (const t of targets) {
    const { createdForOther } = await linkUsers(req.user._id, t._id);
    if (createdForOther) notifyAdded(req, t);
  }
  res.status(201).json({ success: true, added: targets.length });
};

// POST /contacts/match { phones: [...] } — أيّ هذه الأرقام مسجّلة في التطبيق؟ (لا نخزّن الأرقام)
export const matchContacts = async (req, res) => {
  const list = Array.isArray(req.body.phones) ? req.body.phones.slice(0, 500) : [];
  const wanted = new Set();
  for (const p of list) {
    const full = normalizePhone(p, req.user.countryCode);
    if (full && full !== req.user.fullPhone) wanted.add(full);
  }
  const users = await User.find({ fullPhone: { $in: [...wanted] }, ...live }).select('name fullPhone settings.speakLanguage');
  const mine = new Set(
    (await Contact.find({ owner: req.user._id, contact: { $in: users.map((u) => u._id) } }).select('contact')).map((c) => String(c.contact))
  );
  res.json({
    success: true,
    total: wanted.size,
    users: users.map((u) => ({ id: u._id, name: u.name, phone: u.fullPhone, speakLanguage: u.settings?.speakLanguage, isContact: mine.has(String(u._id)) })),
  });
};

export const updateContact = async (req, res) => {
  const nickname = String(req.body.nickname || '').trim().slice(0, 60);
  const doc = await Contact.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, { $set: { nickname: nickname || undefined } }, { new: true }).populate('contact', POPULATE);
  if (!doc) throw new AppError('جهة الاتصال غير موجودة', 404);
  res.json({ success: true, contact: shapeContact(doc, isOnline) });
};

export const removeContact = async (req, res) => {
  await Contact.deleteOne({ _id: req.params.id, owner: req.user._id });
  res.json({ success: true });
};
