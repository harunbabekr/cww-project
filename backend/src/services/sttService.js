import { AppError } from '../middlewares/errorHandler.js';
import { WEAK_WHISPER, fromWhisperName, fromIso3 } from '../utils/languages.js';
import { biasPrompt } from './glossaryService.js';

const GROQ = () => process.env.GROQ_API_KEY;
const ELEVEN = () => process.env.ELEVENLABS_API_KEY;

export const sttProviders = () => ({ whisper: !!GROQ(), scribe: !!ELEVEN() });
export const sttAvailable = () => !!(GROQ() || ELEVEN());

const extOf = (mime = '') =>
  mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
  : mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'webm';

const HALLUCINATIONS = /^(thank you\.?|thanks for watching\.?|you|bye\.?|شكرا للمشاهدة|شكراً للمشاهدة|اشتركوا في القناة|ترجمة نانسي قنقر|مترجم)[.!\s]*$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Groq Whisper — يعيد أيضاً المقاطع الزمنية (تُستخدم في الدبلجة) */
export async function whisper({ buffer, mime, language, filename, prompt }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), filename || `audio.${extOf(mime)}`);
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (language && language !== 'auto') form.append('language', language);
  if (prompt) form.append('prompt', prompt);

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ()}` }, body: form,
    });
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 20 * (attempt + 1), 90);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) {
      console.error('Groq STT error:', res.status, await res.text().catch(() => ''));
      throw new AppError(res.status === 401 ? 'مفتاح Groq غير صالح' : 'فشل التعرف على الصوت', 502);
    }
    const d = await res.json();
    const segs = d.segments || [];
    const speech = segs.filter((s) => (s.no_speech_prob ?? 0) < 0.6);
    const text = speech.map((s) => s.text).join(' ').trim() || (segs.length ? '' : (d.text || '').trim());
    const avg = speech.length ? speech.reduce((a, s) => a + (s.avg_logprob ?? -0.5), 0) / speech.length : -1;
    return {
      provider: 'whisper',
      text: HALLUCINATIONS.test(text) ? '' : text,
      language: fromWhisperName(d.language) || (language !== 'auto' ? language : null),
      confidence: text ? Math.max(0, Math.min(1, Math.exp(avg))) : 0,
      segments: speech.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
    };
  }
  throw new AppError('خدمة التعرف على الصوت مشغولة، حاول بعد قليل', 429);
}

/** ElevenLabs Scribe — أدق من Whisper في لغات مثل الهوسا */
async function scribe({ buffer, mime, language }) {
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');
  form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), `audio.${extOf(mime)}`);
  form.append('tag_audio_events', 'false');
  if (language && language !== 'auto') form.append('language_code', language);

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': ELEVEN() }, body: form,
  });
  if (!res.ok) {
    console.error('Scribe error:', res.status, await res.text().catch(() => ''));
    throw new AppError(res.status === 401 ? 'مفتاح ElevenLabs غير صالح' : 'فشل التعرف على الصوت', 502);
  }
  const d = await res.json();
  const code = d.language_code || '';
  return {
    provider: 'scribe',
    text: (d.text || '').trim(),
    language: code.length === 2 ? code : fromIso3(code) || (language !== 'auto' ? language : null),
    confidence: d.language_probability ?? 0.8,
    segments: [],
  };
}

/**
 * language: لغة محددة، أو 'auto' للكشف التلقائي.
 * candidates: عند 'auto' نقيّد الكشف بهذه اللغات؛ فإن كشف Whisper لغة خارجها (خطأ شائع في الجمل القصيرة
 * وفي اللهجات) أعدنا التعرف بأول لغة مرشّحة بدل قبول لغة خاطئة.
 */
export async function transcribe({ buffer, mime, language = 'auto', candidates = [] }) {
  if (!buffer?.length) throw new AppError('الملف الصوتي فارغ', 400);

  const one = async (lang) => {
    if ((WEAK_WHISPER.has(lang) || (lang === 'auto' && !GROQ())) && ELEVEN()) return scribe({ buffer, mime, language: lang });
    if (GROQ()) return whisper({ buffer, mime, language: lang, prompt: await biasPrompt(lang === 'auto' ? candidates[0] : lang) });
    if (ELEVEN()) return scribe({ buffer, mime, language: lang });
    throw new AppError('خدمة التعرف على الصوت غير مفعّلة (أضف GROQ_API_KEY)', 501);
  };

  const first = await one(language);
  if (language === 'auto' && candidates.length && first.text && first.language && !candidates.includes(first.language)) {
    const retry = await one(candidates[0]);
    return { ...retry, detectedByAuto: false, rejectedDetection: first.language };
  }
  return first;
}
