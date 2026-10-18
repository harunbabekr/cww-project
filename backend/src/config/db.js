import mongoose from 'mongoose';
import User from '../models/User.js';
import { recoverStaleJobs } from '../services/dubbingService.js';
import { backfillNorm } from '../services/glossaryService.js';
import DialectGroup from '../models/DialectGroup.js';
import DialectDictionary from '../models/DialectDictionary.js';
import { DEFAULT_GROUPS } from '../utils/seedData.js';

const connectDB = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI غير معرّف في ملف .env');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new Error('JWT_SECRET مفقود أو قصير (24 حرفاً على الأقل)');
  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`MongoDB Connected: ${conn.connection.host}`);

  // ترقية الحسابات المذكورة في ADMIN_EMAILS إلى مدير
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (admins.length) await User.updateMany({ email: { $in: admins } }, { $set: { role: 'admin' } });
  await recoverStaleJobs();
  // ترحيل بيانات النسخة السابقة: المصطلحات الموثّقة تصبح معتمدة وتُعبَّأ الحقول الجديدة
  await DialectDictionary.updateMany({ status: { $exists: false }, verified: true }, { $set: { status: 'approved' } });
  await DialectDictionary.updateMany({ status: { $exists: false } }, { $set: { status: 'pending' } });
  await DialectDictionary.updateMany({ language: { $exists: false } }, { $set: { language: 'ar' } });
  await backfillNorm();
  // مجموعات اللهجات السودانية الافتراضية (تُضاف الناقصة فقط)
  for (const g of DEFAULT_GROUPS) await DialectGroup.updateOne({ name: g.name }, { $setOnInsert: g }, { upsert: true });
};

export default connectDB;
