import { langLocale } from './languages';

let current = null;
let playing = false;
const listeners = new Set();
const setPlaying = (v) => { playing = v; listeners.forEach((f) => f(v)); };

export const isPlaying = () => playing;
export const onPlaying = (f) => { listeners.add(f); return () => listeners.delete(f); };

export function stopAll() {
  current?.pause();
  current = null;
  window.speechSynthesis?.cancel();
  setPlaying(false);
}

/** تشغيل صوت قادم من الخادم (MP3 base64) — يعيد وعداً ينتهي مع انتهاء الصوت */
export function playAudio({ base64, mime = 'audio/mpeg' }) {
  stopAll();
  return new Promise((resolve) => {
    const a = new Audio(`data:${mime};base64,${base64}`);
    current = a;
    setPlaying(true);
    const done = () => { if (current === a) current = null; setPlaying(false); resolve(); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  });
}

export const hasBrowserVoice = (lang) => {
  const p = langLocale(lang).slice(0, 2).toLowerCase();
  return !!window.speechSynthesis?.getVoices().some((v) => v.lang.toLowerCase().startsWith(p));
};

/** النطق بصوت المتصفح */
export function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve(false);
  stopAll();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langLocale(lang);
    const p = u.lang.slice(0, 2).toLowerCase();
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(p));
    if (voice) u.voice = voice;
    setPlaying(true);
    const done = (ok) => () => { setPlaying(false); resolve(ok); };
    u.onend = done(true); u.onerror = done(false);
    window.speechSynthesis.speak(u);
  });
}

/** يفضّل صوت الخادم إن وصل، وإلا صوت المتصفح */
export const say = ({ text, lang, audio }) => (audio?.base64 ? playAudio(audio) : speak(text, lang));
