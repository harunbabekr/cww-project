import mongoose from 'mongoose';

// جهات الاتصال الخاصة بالمستخدم (قائمة المكالمات والدردشة)
const contactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, trim: true },
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, contact: 1 }, { unique: true });

export default mongoose.model('Contact', contactSchema);
