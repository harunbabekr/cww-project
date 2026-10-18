import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'اسم المستخدم مطلوب'], trim: true, minlength: 2 },
    email: { type: String, required: [true, 'البريد الإلكتروني مطلوب'], unique: true, lowercase: true, trim: true },
    countryCode: { type: String, required: [true, 'رمز الدولة مطلوب'], trim: true },
    phone: { type: String, required: [true, 'رقم الهاتف مطلوب'], trim: true },
    fullPhone: { type: String, unique: true, index: true },
    // كلمة المرور (scrypt) — الرمز OTP يُطلب فقط عند إنشاء الحساب أو نسيان كلمة المرور
    passwordHash: { type: String, select: false },
    tokenVersion: { type: Number, default: 0 }, // يُزاد عند تغيير/استعادة كلمة المرور فتُبطَل الجلسات القديمة
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    discoverable: { type: Boolean, default: true }, // يظهر في البحث بالاسم (البحث بالرقم/البريد الكامل متاح دائماً)
    inviteCode: { type: String, unique: true, sparse: true, index: true }, // رابط الدعوة
    lastSeenAt: { type: Date },

    settings: {
      appLanguage: { type: String, default: 'ar' },
      speakLanguage: { type: String, default: 'ar' }, // لغة المتكلم (لغتي)
      targetLanguage: { type: String, default: 'en' }, // لغة المتكلم الآخر الافتراضية
      autoDetect: { type: Boolean, default: false }, // يُطبَّق على «المتكلم الآخر» فقط
      translationStyle: { type: String, enum: ['colloquial', 'standard'], default: 'colloquial' }, // عامية سودانية | فصحى
      voiceClone: { type: Boolean, default: false },
    },

    // عينة صوت المستخدم المستنسخة (بموافقته الصريحة)
    voice: {
      voiceId: { type: String, select: false },
      provider: { type: String, select: false },
      consentAt: { type: Date, select: false },
      createdAt: { type: Date, select: false },
    },

    verification: {
      channel: { type: String, enum: ['email', 'sms', 'dev'] },
      purpose: { type: String, enum: ['register', 'reset'] },
      sentAt: { type: Date },
      codeHash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
      attempts: { type: Number, default: 0, select: false },
    },
  },
  { timestamps: true }
);

userSchema.pre('validate', function () {
  if (this.countryCode && this.phone) {
    const cc = this.countryCode.startsWith('+') ? this.countryCode : `+${this.countryCode}`;
    this.countryCode = cc;
    this.fullPhone = `${cc}${this.phone.replace(/\D/g, '').replace(/^0+/, '')}`;
  }
});

userSchema.methods.toPublic = function (hasVoice = false) {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.fullPhone,
    role: this.role,
    isVerified: this.isVerified,
    discoverable: this.discoverable !== false,
    settings: this.settings,
    hasVoice,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
