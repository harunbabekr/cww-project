import User from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import { signToken, generateCode, hashCode } from '../utils/token.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { availableChannels, sendEmailCode, sendSmsCode, checkSmsCode } from '../services/otpService.js';
import { publicUser } from '../utils/publicUser.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GENERIC_LOGIN_ERROR = 'بيانات الدخول غير صحيحة';

const mask = (user, channel) =>
  channel === 'sms' ? user.fullPhone.replace(/.(?=.{3})/g, '•') : user.email.replace(/^(.{2}).*(@.*)$/, '$1•••$2');

function validatePassword(pw, email) {
  if (typeof pw !== 'string' || pw.length < 8) throw new AppError('كلمة المرور يجب ألا تقل عن 8 أحرف', 400);
  if (pw.length > 128) throw new AppError('كلمة المرور طويلة جداً', 400);
  if (email && pw.toLowerCase() === String(email).toLowerCase()) throw new AppError('لا تستخدم بريدك ككلمة مرور', 400);
  if (/^\d+$/.test(pw)) throw new AppError('أضف حروفاً إلى كلمة المرور (لا تكتفِ بالأرقام)', 400);
}

const findByIdentifier = (identifier) => {
  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return null;
  return User.findOne(id.includes('@') ? { email: id } : { fullPhone: `+${id.replace(/\D/g, '')}` });
};

/** يرسل رمزاً (OTP) — يُستخدم فقط لتأكيد الحساب الجديد أو استعادة كلمة المرور */
async function sendOtp(user, requested, purpose) {
  const v = user.verification;
  if (v?.sentAt && Date.now() - new Date(v.sentAt).getTime() < RESEND_MS) throw new AppError('انتظر دقيقة قبل طلب رمز جديد', 429);

  const avail = availableChannels();
  const channel = requested === 'sms' ? 'sms' : 'email';
  const base = { purpose, sentAt: new Date(), attempts: 0 };
  let devCode;

  if (channel === 'sms' && avail.sms) {
    await sendSmsCode(user.fullPhone);
    user.verification = { ...base, channel: 'sms' };
  } else {
    const code = generateCode();
    const stored = { ...base, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) };
    if (channel === 'email' && avail.email) {
      await sendEmailCode({ email: user.email, name: user.name, code, purpose });
      user.verification = { ...stored, channel: 'email' };
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[CWW dev] رمز (${purpose}) لـ ${user.email}: ${code}`);
      devCode = code;
      user.verification = { ...stored, channel: 'dev' };
    } else {
      throw new AppError('خدمة إرسال الرمز غير مفعّلة على الخادم', 503);
    }
  }
  await user.save();
  return { channel: user.verification.channel, devCode };
}

/** يتحقق من الرمز المخزَّن للغرض المطلوب (يزيد عدّاد المحاولات عند الخطأ) */
async function checkOtp(user, code, purpose) {
  const v = user?.verification;
  if (!user || !v?.channel || v.purpose !== purpose) throw new AppError('اطلب رمزاً جديداً', 400);
  if ((v.attempts || 0) >= MAX_CODE_ATTEMPTS) throw new AppError('تجاوزت عدد المحاولات، اطلب رمزاً جديداً', 429);

  let ok;
  if (v.channel === 'sms') ok = await checkSmsCode(user.fullPhone, code);
  else {
    if (!v.codeHash || v.expiresAt < new Date()) throw new AppError('انتهت صلاحية الرمز، اطلب رمزاً جديداً', 400);
    ok = v.codeHash === hashCode(code);
  }
  if (!ok) {
    user.verification.attempts = (v.attempts || 0) + 1;
    await user.save();
    throw new AppError('الرمز غير صحيح', 400);
  }
}

const OTP_SELECT = '+verification.codeHash +verification.expiresAt +verification.attempts';
const respondSession = async (res, user, status = 200) =>
  res.status(status).json({ success: true, token: signToken(user._id, user.tokenVersion), user: await publicUser(user) });

// ---------- إنشاء حساب (OTP هنا فقط) ----------
// POST /auth/register { name, email, countryCode, phone, password, channel }
export const register = async (req, res) => {
  const { name, email, countryCode, phone, password, channel } = req.body;
  if (!name?.trim() || !email || !countryCode || !phone) throw new AppError('جميع الحقول مطلوبة', 400);
  if (!EMAIL_RX.test(email)) throw new AppError('البريد الإلكتروني غير صالح', 400);
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) throw new AppError('رقم الهاتف غير صالح', 400);
  validatePassword(password, email);

  const lower = String(email).toLowerCase();
  const existing = await User.findOne({ email: lower });
  if (existing?.isVerified) throw new AppError('هذا البريد مسجل مسبقاً، سجّل الدخول', 409);

  const user = existing || new User({ email: lower });
  user.set({ name: name.trim(), countryCode, phone });
  await user.validate();
  const clash = await User.findOne({ fullPhone: user.fullPhone, _id: { $ne: user._id } });
  if (clash) throw new AppError('رقم الهاتف مستخدم بحساب آخر', 409);

  user.passwordHash = await hashPassword(password);
  const { channel: used, devCode } = await sendOtp(user, channel, 'register');
  res.status(201).json({ success: true, email: user.email, channel: used, sentTo: mask(user, used), devCode });
};

// POST /auth/verify { email, code } — يفعّل الحساب الجديد ويسجّل الدخول
export const verifyCode = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) throw new AppError('البريد والرمز مطلوبان', 400);

  const user = await User.findOne({ email: String(email).toLowerCase() }).select(OTP_SELECT);
  await checkOtp(user, code, 'register');

  user.isVerified = true;
  user.verification = { attempts: 0 };
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase());
  if (admins.includes(user.email)) user.role = 'admin';
  await user.save();
  await respondSession(res, user);
};

// ---------- الدخول بكلمة المرور (بلا OTP) ----------
// POST /auth/login { identifier (بريد أو هاتف بالرمز الدولي), password }
export const login = async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) throw new AppError('أدخل البريد/الهاتف وكلمة المرور', 400);

  const found = await findByIdentifier(identifier);
  const user = found && (await User.findById(found._id).select('+passwordHash +loginAttempts +lockUntil'));
  if (!user) { await verifyPassword(password, null); throw new AppError(GENERIC_LOGIN_ERROR, 401); }

  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(`تم إيقاف المحاولات مؤقتاً، حاول بعد ${Math.ceil((user.lockUntil - Date.now()) / 60000)} دقيقة`, 429);
  }
  if (!user.passwordHash) throw new AppError('لم تُعيَّن كلمة مرور لهذا الحساب، اختر «نسيت كلمة المرور» لتعيينها', 403);

  if (!(await verifyPassword(password, user.passwordHash))) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) { user.lockUntil = new Date(Date.now() + LOCK_MS); user.loginAttempts = 0; }
    await user.save();
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }
  if (!user.isVerified) throw new AppError('الحساب غير مفعّل. أنشئ الحساب من جديد بنفس البريد لتصلك رسالة تأكيد', 403);
  if (!user.isActive) throw new AppError('الحساب معطّل', 403);

  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
  await respondSession(res, user);
};

// ---------- نسيت كلمة المرور (OTP هنا أيضاً) ----------
// POST /auth/forgot { identifier, channel } — الرد موحّد سواء وُجد الحساب أم لا
export const forgotPassword = async (req, res) => {
  const user = await findByIdentifier(req.body.identifier);
  let sentTo, devCode, channel;
  if (user?.isVerified && user.isActive) {
    try {
      const r = await sendOtp(user, req.body.channel, 'reset');
      channel = r.channel; devCode = r.devCode; sentTo = mask(user, r.channel);
    } catch (e) {
      if (e.statusCode !== 429) throw e; // طلب متكرر: نتجاهله بصمت
    }
  }
  res.json({ success: true, message: 'إن كان الحساب موجوداً فقد أرسلنا رمزاً إليه', channel, sentTo, devCode });
};

// POST /auth/reset { identifier, code, newPassword }
export const resetPassword = async (req, res) => {
  const { identifier, code, newPassword } = req.body;
  if (!identifier || !code) throw new AppError('البيانات ناقصة', 400);
  validatePassword(newPassword);

  const found = await findByIdentifier(identifier);
  const user = found && (await User.findById(found._id).select(OTP_SELECT + ' +loginAttempts +lockUntil'));
  await checkOtp(user, code, 'reset');

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // يُنهي كل الجلسات القديمة
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.verification = { attempts: 0 };
  user.isVerified = true;
  await user.save();
  await respondSession(res, user);
};

export const getMe = async (req, res) => {
  res.json({ success: true, user: await publicUser(req.user) });
};
