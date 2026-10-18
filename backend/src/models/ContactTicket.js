import mongoose from 'mongoose';

const contactTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, maxlength: 4000 },
    language: { type: String, default: 'ar' },
    messageAr: { type: String }, // ترجمة الرسالة للعربية ليقرأها المشرف
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    reply: { type: String }, // رد المشرف (بالعربية)
    replyTranslated: { type: String }, // الرد مترجماً للغة المستخدم
    repliedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('ContactTicket', contactTicketSchema);
