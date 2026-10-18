import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import VideoContent from '../models/VideoContent.js';
import { whisper } from './sttService.js';
import translationService, { translationAvailable } from './translationService.js';
import { AppError } from '../middlewares/errorHandler.js';

let ffmpegPath = null;
try { ffmpegPath = (await import('ffmpeg-static')).default; } catch { /* الحزمة غير مثبتة */ }

export const dubbingAvailable = () => !!(ffmpegPath && process.env.GROQ_API_KEY && translationAvailable());

const MAX_BYTES = (Number(process.env.MAX_VIDEO_MB) || 700) * 1024 * 1024;
const MAX_MINUTES = Number(process.env.MAX_DUB_MINUTES) || 120;
const CHUNK_SECONDS = 600;

/** منع روابط الشبكة الداخلية (حماية SSRF أساسية) */
export function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new AppError('رابط غير صالح', 400); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new AppError('يجب أن يبدأ الرابط بـ http أو https', 400);
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h === '[::1]' ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
    throw new AppError('لا يُسمح بروابط الشبكة الداخلية', 400);
  }
  return u.toString();
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`تعذّر تنزيل الفيديو (${res.status})`);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('حجم الفيديو أكبر من المسموح');
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _e, cb) {
      bytes += chunk.length;
      cb(bytes > MAX_BYTES ? new Error('حجم الفيديو أكبر من المسموح') : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest));
}

function extractAudio(input, outDir) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', input, '-t', String(MAX_MINUTES * 60), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k',
      '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-reset_timestamps', '1', path.join(outDir, 'chunk_%03d.mp3')];
    const p = spawn(ffmpegPath, args);
    let tail = '';
    p.stderr.on('data', (d) => { tail = (tail + d).slice(-600); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg فشل: ${tail.split('\n').slice(-3).join(' ')}`));
      resolve(fs.readdirSync(outDir).filter((f) => f.startsWith('chunk_')).sort().map((f) => path.join(outDir, f)));
    });
  });
}

async function setJob(videoId, language, patch) {
  const set = Object.fromEntries(Object.entries({ ...patch, updatedAt: new Date() }).map(([k, v]) => [`dubbing.$.${k}`, v]));
  const r = await VideoContent.updateOne({ _id: videoId, 'dubbing.language': language }, { $set: set });
  if (!r.matchedCount) await VideoContent.updateOne({ _id: videoId }, { $push: { dubbing: { language, ...patch, updatedAt: new Date() } } });
}

async function transcribeVideo(video) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cww-'));
  try {
    const file = path.join(dir, 'video.bin');
    await download(video.videoUrl, file);
    const chunks = await extractAudio(file, dir);
    if (!chunks.length) throw new Error('لم يُعثر على مسار صوتي في الفيديو');

    const segments = [];
    let language = video.originalLanguage;
    for (let i = 0; i < chunks.length; i++) {
      const r = await whisper({ buffer: fs.readFileSync(chunks[i]), mime: 'audio/mpeg', language: video.originalLanguage });
      if (i === 0 && r.language) language = r.language;
      for (const s of r.segments) segments.push({ start: s.start + i * CHUNK_SECONDS, end: s.end + i * CHUNK_SECONDS, text: s.text });
    }
    if (!segments.length) throw new Error('لم يُكتشف كلام في الفيديو');
    return { language, segments };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function run(videoId, lang) {
  try {
    let video = await VideoContent.findById(videoId).select('+transcript.segments videoUrl originalLanguage');
    if (!video) return;

    if (!video.transcript?.segments?.length) {
      await setJob(videoId, lang, { status: 'processing', step: 'تنزيل الفيديو واستخراج الصوت والتعرف على الكلام', error: '' });
      const t = await transcribeVideo(video);
      await VideoContent.updateOne({ _id: videoId }, { $set: { transcript: t } });
      video = await VideoContent.findById(videoId).select('+transcript.segments');
    }

    await setJob(videoId, lang, { status: 'processing', step: 'الترجمة', error: '' });
    const { language: srcLang, segments } = video.transcript;
    const texts = await translationService.translateBatch(segments.map((s) => s.text), srcLang, lang);
    const track = { language: lang, segments: segments.map((s, i) => ({ start: s.start, end: s.end, text: texts[i] })), createdAt: new Date() };

    await VideoContent.updateOne({ _id: videoId }, { $pull: { tracks: { language: lang } } });
    await VideoContent.updateOne({ _id: videoId }, { $push: { tracks: track } });
    await setJob(videoId, lang, { status: 'done', step: '', error: '' });
  } catch (err) {
    console.error('Dubbing job failed:', err);
    await setJob(videoId, lang, { status: 'failed', step: '', error: String(err.message || err).slice(0, 300) });
  }
}

let chain = Promise.resolve(); // مهمة واحدة في كل مرة لحماية الموارد
export async function enqueueDubbing(videoId, lang) {
  await setJob(videoId, lang, { status: 'processing', step: 'في الانتظار', error: '' });
  chain = chain.then(() => run(videoId, lang));
}

/** مهام بقيت "processing" بعد إعادة تشغيل الخادم تُعلَّم فاشلة */
export async function recoverStaleJobs() {
  await VideoContent.updateMany({ 'dubbing.status': 'processing' }, { $set: { 'dubbing.$[j].status': 'failed', 'dubbing.$[j].error': 'أُعيد تشغيل الخادم أثناء المعالجة' } }, { arrayFilters: [{ 'j.status': 'processing' }] });
}
