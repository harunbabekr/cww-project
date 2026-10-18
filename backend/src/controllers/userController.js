import User from '../models/User.js';
import PushSubscription from '../models/PushSubscription.js';
import { AppError } from '../middlewares/errorHandler.js';
import { isSupportedLanguage } from '../utils/languages.js';
import { createVoice, deleteVoice } from '../services/voiceService.js';
import { publicUser } from '../utils/publicUser.js';
import { vapidPublicKey } from '../services/pushService.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken, escapeRegex } from '../utils/token.js';
import Contact from '../models/Contact.js';
import DeviceToken from '../models/DeviceToken.js';
import { normalizePhone, looksLikePhone } from '../utils/phone.js';
import { ensureInviteCode } from '../utils/invite.js';

const LANG_FIELDS = ['appLanguage', 'speakLanguage', 'targetLanguage'];
const BOOL_FIELDS = ['autoDetect', 'voiceClone'];

export const updateSettings = async (req, res) => {
  const user = await User.findById(req.user._id).select('+voice.voiceId');
  for (const f of LANG_FIELDS) {
    if (req.body[f] === undefined) continue;
    if (!isSupportedLanguage(req.body[f]) || req.body[f] === 'auto') throw new AppError(`لغة غير مدعومة: ${f}`, 400);
    user.settings[f] = req.body[f];
  }
  for (const f of BOOL_FIELDS) if (typeof req.body[f] === 'boolean') user.settings[f] = req.body[f];
  if (user.settings.voiceClone && !user.voice?.voiceId) throw new AppError('سجّل عينة صوتك أولاً لتفعيل محاكاة الصوت', 400);
  if (typeof req.body.discoverable === 'boolean') user.discoverable = req.body.discoverable;
  if (['colloquial', 'standard'].includes(req.body.translationStyle)) user.settings.translationStyle = req.body.translationStyle;
  if (typeof req.body.name === 'string' && req.body.name.trim().length >= 2) user.name = req.body.name.trim();

  await user.save();
  res.json({ success: true, user: user.toPublic(!!user.voice?.voiceId) });
};

// GET /users/search?q=  — رقم هاتف (محلي أو دولي) | بريد كامل | اسم (3 أحرف فأكثر)
export const searchUsers = async (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (raw.length < 2) throw new AppError('اكتب رقم الهاتف أو البريد أو الاسم', 400);

  const base = { isVerified: true, isActive: true, _id: { $ne: req.user._id } };
  let users = [];
  if (raw.includes('@')) {
    users = await User.find({ ...base, email: raw.toLowerCase() }).limit(1);
  } else if (looksLikePhone(raw)) {
    const full = normalizePhone(raw, req.user.countryCode);
    if (full) users = await User.find({ ...base, fullPhone: full }).limit(1);
  } else {
    if (raw.length < 3) throw new AppError('اكتب 3 أحرف على الأقل من الاسم', 400);
    users = await User.find({ ...base, discoverable: { $ne: false }, name: new RegExp(escapeRegex(raw.slice(0, 40)), 'i') }).limit(10);
  }

  const mine = new Set((await Contact.find({ owner: req.user._id, contact: { $in: users.map((u) => u._id) } }).select('contact')).map((c) => String(c.contact)));
  const list = users.map((u) => ({ id: u._id, name: u.name, phone: u.fullPhone, isContact: mine.has(String(u._id)) }));
  res.json({ success: true, users: list, user: list[0] || null });
};

// GET /users/me/invite — رمز دعوتي (يُنشأ عند أول طلب)
export const getMyInvite = async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, code: await ensureInviteCode(user) });
};

// POST /users/me/voice  (جسم الطلب: ملف صوتي خام) + ترويسة x-voice-consent: yes
export const uploadVoice = async (req, res) => {
  if (req.headers['x-voice-consent'] !== 'yes') throw new AppError('يلزم موافقتك الصريحة على استنساخ صوتك', 400);
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length < 40000) throw new AppError('العينة الصوتية قصيرة جداً (سجّل 30 ثانية على الأقل)', 400);

  const user = await User.findById(req.user._id).select('+voice.voiceId');
  const voiceId = await createVoice({ name: user.name, buffer, mime: req.headers['content-type'] });
  if (user.voice?.voiceId) await deleteVoice(user.voice.voiceId);

  user.voice = { voiceId, provider: 'elevenlabs', consentAt: new Date(), createdAt: new Date() };
  user.settings.voiceClone = true;
  await user.save();
  res.json({ success: true, user: user.toPublic(true) });
};

export const removeVoice = async (req, res) => {
  const user = await User.findById(req.user._id).select('+voice.voiceId');
  if (user.voice?.voiceId) await deleteVoice(user.voice.voiceId);
  user.voice = undefined;
  user.settings.voiceClone = false;
  await user.save();
  res.json({ success: true, user: user.toPublic(false) });
};

// PATCH /users/me/password { currentPassword, newPassword }
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128 || /^\d+$/.test(newPassword)) {
    throw new AppError('كلمة المرور الجديدة: 8 أحرف على الأقل وتحتوي حروفاً', 400);
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(String(currentPassword || ''), user.passwordHash))) throw new AppError('كلمة المرور الحالية غير صحيحة', 400);

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // تنتهي بقية الأجهزة
  await user.save();
  res.json({ success: true, token: signToken(user._id, user.tokenVersion) });
};

// ---- الإشعارات (Web Push) ----
export const getPushKey = (req, res) => res.json({ success: true, key: vapidPublicKey() });

export const subscribePush = async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new AppError('اشتراك غير صالح', 400);
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: req.user._id, endpoint, keys, userAgent: String(req.headers['user-agent'] || '').slice(0, 200) },
    { upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true });
};

export const unsubscribePush = async (req, res) => {
  await PushSubscription.deleteOne({ endpoint: req.body?.endpoint, user: req.user._id });
  res.json({ success: true });
};

// POST /users/push/fcm { token, platform: 'android'|'ios' } — تسجيل جهاز فلاتر لتلقي الإشعارات
export const subscribeFcm = async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string' || token.length > 4096) throw new AppError('رمز الجهاز غير صالح', 400);
  await DeviceToken.findOneAndUpdate(
    { token },
    { user: req.user._id, token, platform: platform === 'ios' ? 'ios' : 'android' },
    { upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true });
};

export const unsubscribeFcm = async (req, res) => {
  await DeviceToken.deleteOne({ token: req.body?.token, user: req.user._id });
  res.json({ success: true });
};

export { publicUser };
