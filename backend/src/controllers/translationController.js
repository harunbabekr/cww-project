import User from '../models/User.js';
import translationService from '../services/translationService.js';
import { transcribe } from '../services/sttService.js';
import { synthesize } from '../services/ttsService.js';
import { verifyTranslation } from '../services/qualityService.js';
import { AppError } from '../middlewares/errorHandler.js';
import { LANGUAGES, isSupportedLanguage } from '../utils/languages.js';

export const listLanguages = (req, res) => res.json({ success: true, languages: LANGUAGES });

// معرّف صوت المستخدم المستنسخ إن فعّله
async function cloneVoiceOf(userId, wanted) {
  if (!wanted) return null;
  const u = await User.findById(userId).select('settings.voiceClone +voice.voiceId');
  return u?.settings?.voiceClone ? u.voice?.voiceId || null : null;
}

const parseCandidates = (v) => String(v || '').split(',').map((x) => x.trim()).filter((x) => x && isSupportedLanguage(x) && x !== 'auto');
const styleOf = (req) => req.user.settings?.translationStyle || 'colloquial';
const audioOf = (a) => (a ? { base64: a.base64, mime: a.mime, provider: a.provider } : null);

// POST /translate/text { text, from, to }
export const translateText = async (req, res) => {
  const { text, from = 'auto', to } = req.body;
  res.json({ success: true, data: await translationService.translateText(text, from, to, { style: styleOf(req) }) });
};

// POST /translate/stt?language=ar|auto   (جسم الطلب: ملف صوتي خام)
export const speechToText = async (req, res) => {
  const language = String(req.query.language || 'auto');
  if (!isSupportedLanguage(language)) throw new AppError('لغة غير مدعومة', 400);
  const r = await transcribe({ buffer: req.body, mime: req.headers['content-type'], language, candidates: parseCandidates(req.query.candidates) });
  res.json({ success: true, data: { text: r.text, language: r.language, confidence: r.confidence, provider: r.provider } });
};

// POST /translate/tts { text, language, myVoice }
export const textToSpeech = async (req, res) => {
  const { text, language, myVoice } = req.body;
  if (!text || !isSupportedLanguage(language)) throw new AppError('النص واللغة مطلوبان', 400);
  const audio = await synthesize({ text, language, cloneVoiceId: await cloneVoiceOf(req.user._id, myVoice), userId: String(req.user._id) });
  res.json({ success: true, data: { audio: audioOf(audio) } });
};

// POST /translate/speech?from=ar|auto&to=en&myVoice=1  — صوت ← نص ← ترجمة ← صوت (في طلب واحد)
export const speechToSpeech = async (req, res) => {
  const from = String(req.query.from || 'auto');
  const to = String(req.query.to || '');
  if (!isSupportedLanguage(from) || !isSupportedLanguage(to) || to === 'auto') throw new AppError('لغات غير صالحة', 400);

  const stt = await transcribe({ buffer: req.body, mime: req.headers['content-type'], language: from, candidates: parseCandidates(req.query.candidates) });
  if (!stt.text) return res.json({ success: true, data: { empty: true } });

  const source = stt.language || from;
  const tr = await translationService.translateText(stt.text, source, to, { style: styleOf(req) });
  const audio = await synthesize({
    text: tr.translated, language: to, cloneVoiceId: await cloneVoiceOf(req.user._id, req.query.myVoice === '1'), userId: String(req.user._id),
  });

  res.json({
    success: true,
    data: { recognized: stt.text, detectedLanguage: source, rejectedDetection: stt.rejectedDetection || null, confidence: stt.confidence, translated: tr.translated, engine: tr.engine, audio: audioOf(audio) },
  });
};

// POST /translate/verify { text, from, to, translated } — مراجعة جودة الترجمة
export const verify = async (req, res) => {
  const { text, from, to, translated } = req.body;
  if (!text || !translated || !isSupportedLanguage(from) || !isSupportedLanguage(to) || from === 'auto' || to === 'auto') throw new AppError('بيانات غير مكتملة', 400);
  res.json({ success: true, data: await verifyTranslation({ text, from, to, translated }) });
};

// POST /translate/multi { text, from, to: ["en","fr",...] } — ترجمة نص واحد لعدة لغات (المحادثة الجماعية وجهاً لوجه)
export const translateMulti = async (req, res) => {
  const { text, from = 'auto', to } = req.body;
  const targets = [...new Set(Array.isArray(to) ? to : [])].filter((l) => isSupportedLanguage(l) && l !== 'auto').slice(0, 8);
  if (!String(text || '').trim() || !targets.length) throw new AppError('النص واللغات مطلوبة', 400);
  const translations = {};
  await Promise.all(targets.map(async (l) => {
    try { translations[l] = (await translationService.translateText(text, from, l, { style: styleOf(req) })).translated; }
    catch { translations[l] = null; }
  }));
  res.json({ success: true, data: { translations } });
};
