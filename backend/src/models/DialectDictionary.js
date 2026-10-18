import mongoose from 'mongoose';
import { normalizePhrase } from '../utils/arabic.js';

const dialectDictionarySchema = new mongoose.Schema(
  {
    word: { type: String, required: true, trim: true },
    variants: [{ type: String, trim: true }], // تهجئات بديلة للكلمة نفسها
    norm: { type: String, index: true }, // الصيغة المطبّعة للمطابقة
    variantNorms: [{ type: String }],
    dialect: { type: String, required: true, trim: true, index: true }, // اسم المجموعة
    language: { type: String, default: 'ar' },
    standardMeaning: { type: String, required: true, trim: true }, // المعنى بالعربية
    examples: [{ type: String, trim: true }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, trim: true },
  },
  { timestamps: true }
);

dialectDictionarySchema.pre('validate', function () {
  this.norm = normalizePhrase(this.word);
  this.variantNorms = (this.variants || []).map(normalizePhrase).filter(Boolean);
});

dialectDictionarySchema.index({ word: 1, dialect: 1 }, { unique: true });
dialectDictionarySchema.index({ dialect: 1, status: 1 });

export default mongoose.model('DialectDictionary', dialectDictionarySchema);
