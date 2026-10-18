import mongoose from 'mongoose';

// مجموعة لهجات/رطانات: الفلاتة، البرقو، الهوسا، التامة، السودانية...
const dialectGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameEn: { type: String, trim: true },
    code: { type: String, trim: true }, // رمز اللغة (ff, ha, zag...)
    category: { type: String, enum: ['tribal', 'sudanese_arabic', 'other_arabic'], default: 'tribal', index: true },
    // إن كانت اللغة مدعومة في الترجمة الآلية (مثل ha) تُستخدم الترجمة الآلية مع القاموس
    mtLanguage: { type: String, trim: true },
    region: { type: String, trim: true },
    description: { type: String, trim: true },
    order: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('DialectGroup', dialectGroupSchema);
