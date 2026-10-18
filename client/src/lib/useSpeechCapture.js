import { useEffect } from 'react';
import api from '../services/api';
import { createUtteranceRecorder, sendAudio } from './recorder';
import { createRecognizer, browserSpeechSupported } from './browserSpeech';
import { isPlaying } from './audio';

/** يلتقط كلامي من البث الصوتي ويسلّم النص لـ onText (خادم Whisper إن توفر وإلا متصفح) */
export function useSpeechCapture({ enabled, stream, lang, mutedRef, serverStt, onText }) {
  useEffect(() => {
    if (!enabled || !stream) return undefined;
    const send = (text) => { if (text && !mutedRef.current) onText(text, lang); };

    if (serverStt) {
      const rec = createUtteranceRecorder(stream, {
        isPaused: () => isPlaying() || mutedRef.current,
        onUtterance: async ({ blob, mime }) => {
          try {
            const { data } = await sendAudio(api, '/translate/stt', blob, mime, { language: lang });
            send(data.data.text);
          } catch { /* جملة واحدة فاشلة لا توقف المكالمة */ }
        },
      });
      return () => rec.stop();
    }
    if (browserSpeechSupported) {
      let alive = true;
      const rec = createRecognizer({ lang, continuous: true, onFinal: send, onEnd: () => alive && rec?.start() });
      rec?.start();
      return () => { alive = false; rec?.stop(); };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stream, lang, serverStt]);
}
