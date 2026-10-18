import { AppError } from '../middlewares/errorHandler.js';

const key = () => process.env.ELEVENLABS_API_KEY;
export const voiceCloneAvailable = () => !!key();

export async function createVoice({ name, buffer, mime }) {
  if (!key()) throw new AppError('استنساخ الصوت غير مفعّل (أضف ELEVENLABS_API_KEY)', 501);
  const form = new FormData();
  form.append('name', `CWW-${name}`.slice(0, 60));
  form.append('remove_background_noise', 'true');
  form.append('files', new Blob([buffer], { type: mime || 'audio/webm' }), `sample.${(mime || '').includes('mp4') ? 'm4a' : 'webm'}`);

  const res = await fetch('https://api.elevenlabs.io/v1/voices/add', { method: 'POST', headers: { 'xi-api-key': key() }, body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('ElevenLabs add voice error:', res.status, JSON.stringify(err));
    const status = err?.detail?.status || '';
    throw new AppError(
      res.status === 401 || /can_not_use_instant_voice_cloning|needs_subscription|payment/i.test(status + JSON.stringify(err))
        ? 'استنساخ الصوت يتطلب خطة ElevenLabs مدفوعة (Starter أو أعلى)'
        : err?.detail?.message || 'فشل إنشاء نسخة الصوت',
      res.status === 401 ? 502 : 400
    );
  }
  return (await res.json()).voice_id;
}

export async function deleteVoice(voiceId) {
  if (!key() || !voiceId) return;
  await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, { method: 'DELETE', headers: { 'xi-api-key': key() } }).catch(() => {});
}
