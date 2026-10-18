import { AppError } from '../middlewares/errorHandler.js';
import { localeOf } from '../utils/languages.js';

const ELEVEN = () => process.env.ELEVENLABS_API_KEY;
const AZURE = () => process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION;

const AZURE_VOICES = {
  ar: 'ar-SA-HamedNeural', en: 'en-US-JennyNeural', fr: 'fr-FR-DeniseNeural', es: 'es-ES-ElviraNeural',
  de: 'de-DE-KatjaNeural', it: 'it-IT-ElsaNeural', pt: 'pt-BR-FranciscaNeural', ru: 'ru-RU-SvetlanaNeural',
  tr: 'tr-TR-EmelNeural', hi: 'hi-IN-SwaraNeural', zh: 'zh-CN-XiaoxiaoNeural', ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural', fa: 'fa-IR-DilaraNeural', ur: 'ur-PK-UzmaNeural', id: 'id-ID-GadisNeural',
  sw: 'sw-KE-ZuriNeural', bn: 'bn-BD-NabanitaNeural', nl: 'nl-NL-ColetteNeural', pl: 'pl-PL-ZofiaNeural',
  uk: 'uk-UA-PolinaNeural', he: 'he-IL-HilaNeural', th: 'th-TH-PremwadeeNeural', vi: 'vi-VN-HoaiMyNeural', ms: 'ms-MY-YasminNeural',
};
const ELEVEN_V3_ONLY = new Set(['ha']); // لغات تحتاج eleven_v3
const DEFAULT_ELEVEN_VOICE = () => process.env.ELEVENLABS_DEFAULT_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export const ttsStatus = () => ({ elevenlabs: !!ELEVEN(), azure: !!AZURE() });
export const ttsAvailable = () => !!(ELEVEN() || AZURE());

// حماية رصيد ElevenLabs المجاني: حد يومي لكل مستخدم (بالأحرف)
const usage = new Map();
const dayKey = () => new Date().toISOString().slice(0, 10);
function spend(userId, chars) {
  if (!userId) return true;
  const limit = Number(process.env.TTS_DAILY_CHAR_LIMIT) || 4000;
  const k = `${userId}:${dayKey()}`;
  const used = usage.get(k) || 0;
  if (used + chars > limit) return false;
  usage.set(k, used + chars);
  if (usage.size > 5000) usage.clear();
  return true;
}

async function elevenTTS(text, language, voiceId) {
  const model = process.env.ELEVENLABS_MODEL || (ELEVEN_V3_ONLY.has(language) ? 'eleven_v3' : 'eleven_multilingual_v2');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN(), 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!res.ok) {
    console.error('ElevenLabs TTS error:', res.status, await res.text().catch(() => ''));
    throw new AppError('فشل توليد الصوت (ElevenLabs)', 502);
  }
  return Buffer.from(await res.arrayBuffer());
}

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

async function azureTTS(text, language) {
  const ssml = `<speak version='1.0' xml:lang='${localeOf(language)}'><voice name='${AZURE_VOICES[language]}'>${esc(text)}</voice></speak>`;
  const res = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: ssml,
  });
  if (!res.ok) throw new AppError('فشل توليد الصوت (Azure)', 502);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * يعيد { base64, mime, provider } أو null (فيُنطق النص في المتصفح).
 * الأولوية: صوت المستخدم المستنسخ ← Azure (لغة مدعومة) ← صوت ElevenLabs افتراضي (مثل الهوسا).
 */
export async function synthesize({ text, language, cloneVoiceId, userId }) {
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) return null;
  try {
    if (ELEVEN() && cloneVoiceId && spend(userId, clean.length)) {
      return { base64: (await elevenTTS(clean, language, cloneVoiceId)).toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs-clone' };
    }
    if (AZURE() && AZURE_VOICES[language]) {
      return { base64: (await azureTTS(clean, language)).toString('base64'), mime: 'audio/mpeg', provider: 'azure' };
    }
    if (ELEVEN() && !AZURE_VOICES[language] && spend(userId, clean.length)) {
      return { base64: (await elevenTTS(clean, language, DEFAULT_ELEVEN_VOICE())).toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs' };
    }
  } catch (err) {
    console.error('TTS failed, falling back to browser voice:', err.message);
  }
  return null;
}
