import mongoose from 'mongoose';
import VideoContent from '../models/VideoContent.js';
import { AppError } from '../middlewares/errorHandler.js';
import { escapeRegex } from '../utils/token.js';
import { isSupportedLanguage } from '../utils/languages.js';
import { assertPublicUrl, dubbingAvailable, enqueueDubbing } from '../services/dubbingService.js';

const shape = (v) => {
  const o = v.toObject ? v.toObject() : v;
  return { ...o, languages: (o.tracks || []).map((t) => t.language), tracks: undefined, transcript: undefined };
};
const isId = (id) => mongoose.isValidObjectId(id);

export const listVideos = async (req, res) => {
  const { q, category } = req.query;
  const filter = { isPublic: true };
  if (category) filter.category = String(category);
  if (q) {
    const rx = new RegExp(escapeRegex(String(q).slice(0, 60)), 'i');
    filter.$or = [{ title: rx }, { tags: rx }, { description: rx }];
  }
  const videos = await VideoContent.find(filter).sort({ createdAt: -1 }).limit(60);
  res.json({ success: true, videos: videos.map(shape) });
};

export const getVideo = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('معرّف غير صالح', 400);
  const video = await VideoContent.findOneAndUpdate({ _id: req.params.id, isPublic: true }, { $inc: { views: 1 } }, { new: true });
  if (!video) throw new AppError('الفيديو غير موجود', 404);

  const related = await VideoContent.find({
    _id: { $ne: video._id }, isPublic: true, $or: [{ category: video.category }, { tags: { $in: video.tags } }],
  }).sort({ views: -1 }).limit(8);

  res.json({ success: true, video: shape(video), related: related.map(shape) });
};

// GET /watch/:id/track/:lang  → مقاطع النص (ترجمة/دبلجة) للغة
export const getTrack = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('معرّف غير صالح', 400);
  const video = await VideoContent.findById(req.params.id).select('tracks +tracks.segments');
  const track = video?.tracks.find((t) => t.language === req.params.lang);
  if (!track) throw new AppError('لا توجد ترجمة بهذه اللغة بعد', 404);
  res.json({ success: true, segments: track.segments });
};

export const createVideo = async (req, res) => {
  const { title, description, videoUrl, thumbnailUrl, originalLanguage = 'en', category, tags } = req.body;
  if (!title?.trim() || !videoUrl) throw new AppError('العنوان ورابط الفيديو مطلوبان', 400);
  if (!isSupportedLanguage(originalLanguage) || originalLanguage === 'auto') throw new AppError('لغة الفيديو غير مدعومة', 400);
  const video = await VideoContent.create({
    title: title.trim(), description, videoUrl: assertPublicUrl(videoUrl), thumbnailUrl, originalLanguage, category,
    tags: Array.isArray(tags) ? tags : String(tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    uploader: req.user._id,
  });
  res.status(201).json({ success: true, video: shape(video) });
};

export const deleteVideo = async (req, res) => {
  await VideoContent.deleteOne({ _id: req.params.id });
  res.json({ success: true });
};

// POST /watch/:id/dub { language }
export const requestDubbing = async (req, res) => {
  const { language } = req.body;
  if (!isId(req.params.id)) throw new AppError('معرّف غير صالح', 400);
  if (!isSupportedLanguage(language) || language === 'auto') throw new AppError('لغة غير مدعومة', 400);
  if (!dubbingAvailable()) throw new AppError('الدبلجة تتطلب GROQ_API_KEY وتثبيت ffmpeg-static (npm install)', 501);

  const video = await VideoContent.findById(req.params.id).select('dubbing');
  if (!video) throw new AppError('الفيديو غير موجود', 404);
  if (video.dubbing.some((d) => d.language === language && d.status === 'processing')) throw new AppError('المعالجة جارية بالفعل', 409);

  await enqueueDubbing(video._id, language);
  res.status(202).json({ success: true, message: 'بدأت المعالجة' });
};

// GET /watch/:id/jobs — حالة مهام الدبلجة (للمشرفين)
export const getJobs = async (req, res) => {
  const video = await VideoContent.findById(req.params.id).select('dubbing');
  res.json({ success: true, jobs: video?.dubbing || [] });
};

// ---- طلب ترجمة بلغة المستخدم (لأي مستخدم، بحد يومي حماية لحصة الخدمات المجانية) ----
const reqUsage = new Map();
const DAILY_REQUESTS = Number(process.env.USER_DUB_REQUESTS_PER_DAY) || 3;

// POST /watch/:id/request { language }
export const requestTranslation = async (req, res) => {
  const { language } = req.body;
  if (!isId(req.params.id)) throw new AppError('معرّف غير صالح', 400);
  if (!isSupportedLanguage(language) || language === 'auto') throw new AppError('لغة غير مدعومة', 400);
  if (!dubbingAvailable()) throw new AppError('ترجمة الفيديوهات غير مفعّلة على الخادم حالياً', 501);

  const video = await VideoContent.findById(req.params.id).select('dubbing tracks.language originalLanguage');
  if (!video) throw new AppError('الفيديو غير موجود', 404);
  if (language === video.originalLanguage || video.tracks.some((t) => t.language === language)) throw new AppError('الترجمة متوفرة بالفعل', 409);
  if (video.dubbing.some((d) => d.language === language && d.status === 'processing')) return res.status(202).json({ success: true, message: 'المعالجة جارية' });

  const key = `${req.user._id}:${new Date().toISOString().slice(0, 10)}`;
  const used = reqUsage.get(key) || 0;
  if (used >= DAILY_REQUESTS) throw new AppError(`بلغت حدك اليومي (${DAILY_REQUESTS} طلبات)، حاول غداً`, 429);
  reqUsage.set(key, used + 1);
  if (reqUsage.size > 5000) reqUsage.clear();

  await enqueueDubbing(video._id, language);
  res.status(202).json({ success: true, message: 'بدأت المعالجة، ستكون الترجمة جاهزة خلال دقائق' });
};

// GET /watch/:id/status — حالة مهام الترجمة (بلا تفاصيل الأخطاء الداخلية)
export const getStatus = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('معرّف غير صالح', 400);
  const video = await VideoContent.findById(req.params.id).select('dubbing tracks.language');
  res.json({ success: true, jobs: (video?.dubbing || []).map((d) => ({ language: d.language, status: d.status, step: d.step })), languages: (video?.tracks || []).map((t) => t.language) });
};
