import mongoose from 'mongoose';

const segmentSchema = new mongoose.Schema({ start: Number, end: Number, text: String }, { _id: false });

const videoContentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    videoUrl: { type: String, required: true },
    thumbnailUrl: { type: String },
    originalLanguage: { type: String, default: 'en' },
    category: { type: String, enum: ['lecture', 'movie', 'series', 'other'], default: 'other', index: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tags: [{ type: String, trim: true }],
    views: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },

    // النص الأصلي المستخرج بالتعرف على الكلام
    transcript: { language: String, segments: { type: [segmentSchema], select: false } },
    // الترجمات/الدبلجات الجاهزة لكل لغة
    tracks: [{ language: { type: String, required: true }, segments: { type: [segmentSchema], select: false }, createdAt: Date }],
    // حالة مهام الدبلجة
    dubbing: [{ language: String, status: { type: String, enum: ['processing', 'done', 'failed'] }, step: String, error: String, updatedAt: Date }],
  },
  { timestamps: true }
);

videoContentSchema.index({ title: 'text', tags: 'text', description: 'text' });

export default mongoose.model('VideoContent', videoContentSchema);
