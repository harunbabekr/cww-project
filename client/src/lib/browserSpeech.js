import { langLocale } from './languages';

// احتياطي مجاني: التعرف على الكلام من المتصفح (Chrome/Edge/Safari) عند عدم ضبط مفاتيح الخادم
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const browserSpeechSupported = !!SR;

export function createRecognizer({ lang, continuous = false, onText, onFinal, onError, onEnd }) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = langLocale(lang);
  rec.continuous = continuous;
  rec.interimResults = true;
  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) onFinal?.(r[0].transcript.trim(), r[0].confidence);
      else interim += r[0].transcript;
    }
    if (interim) onText?.(interim);
  };
  rec.onerror = (e) => e.error !== 'no-speech' && e.error !== 'aborted' && onError?.(e.error);
  rec.onend = () => onEnd?.();
  return {
    start: () => { try { rec.start(); } catch { /* يعمل */ } },
    stop: () => { try { rec.stop(); } catch { /* متوقف */ } },
  };
}
