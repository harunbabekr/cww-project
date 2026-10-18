import mongoose from 'mongoose';

// سجل المكالمات (فردية وجماعية) — يُحذف تلقائياً بعد 90 يوماً
const callLogSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['direct', 'group'], default: 'direct' },
    video: { type: Boolean, default: false },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // الفردية فقط
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    joined: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // الجماعية: من انضم فعلاً
    status: { type: String, enum: ['ringing', 'answered', 'completed', 'missed', 'rejected', 'cancelled', 'failed'], default: 'ringing' },
    startedAt: { type: Date, default: Date.now },
    answeredAt: Date,
    endedAt: Date,
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model('CallLog', callLogSchema);
