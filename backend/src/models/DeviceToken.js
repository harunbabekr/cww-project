import mongoose from 'mongoose';

// رموز FCM لأجهزة تطبيق الجوال (فلاتر): أندرويد / iOS
const deviceTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
  },
  { timestamps: true }
);

export default mongoose.model('DeviceToken', deviceTokenSchema);
