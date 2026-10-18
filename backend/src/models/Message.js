import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalText: { type: String, required: true, trim: true, maxlength: 4000 },
    sourceLanguage: { type: String, default: 'auto' },
    // الترجمات حسب رمز اللغة: { en: "...", fr: "..." }
    translations: { type: Map, of: String, default: {} },
    type: { type: String, enum: ['text', 'audio', 'image'], default: 'text' },
    mediaUrl: { type: String },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
