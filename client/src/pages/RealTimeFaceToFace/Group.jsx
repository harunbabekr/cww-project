import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Plus, X, LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api, { errMsg } from '../../services/api';
import { useFeatures } from '../../lib/features';
import { getMic, recordClip, recordingSupported, sendAudio } from '../../lib/recorder';
import { createRecognizer, browserSpeechSupported } from '../../lib/browserSpeech';
import { say } from '../../lib/audio';
import { langName } from '../../lib/languages';
import { LanguageSelect } from '../../components/ui';

const MAX = 6;
const FALLBACK = ['ar', 'en', 'fr', 'ha', 'sw', 'es'];
let uid = 0;

/** محادثة واقعية جماعية: عدة متكلمين على جهاز واحد، كل منهم بلغته. ما يقوله أحدهم يُترجم لجميع اللغات الأخرى. */
export default function Group() {
  const { user } = useAuth();
  const features = useFeatures();
  const s = user.settings;
  const [speakers, setSpeakers] = useState(() => [
    { id: ++uid, name: 'أنا', lang: s.speakLanguage },
    { id: ++uid, name: 'متكلم 2', lang: s.targetLanguage },
    { id: ++uid, name: 'متكلم 3', lang: FALLBACK.find((l) => l !== s.speakLanguage && l !== s.targetLanguage) },
  ]);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(null);
  const [feed, setFeed] = useState([]); // { id, speakerId, name, text, translations }
  const [speakOn, setSpeakOn] = useState(true);
  const [error, setError] = useState('');

  const clipRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const speakersRef = useRef(speakers);
  speakersRef.current = speakers;
  const serverStt = features.stt?.available && recordingSupported();

  useEffect(() => () => { recRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const update = (id, patch) => setSpeakers((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const translateAll = async (sp, text) => {
    const targets = [...new Set(speakersRef.current.filter((x) => x.id !== sp.id && x.lang !== sp.lang).map((x) => x.lang))];
    let translations = {};
    if (targets.length) {
      const { data } = await api.post('/translate/multi', { text, from: sp.lang, to: targets });
      translations = data.data.translations;
    }
    setFeed((f) => [...f.slice(-30), { id: crypto.randomUUID(), speakerId: sp.id, name: sp.name, lang: sp.lang, text, translations }]);
    if (speakOn) for (const l of targets) if (translations[l]) await say({ text: translations[l], lang: l }); // ننطق كل لغة بالتتابع
  };

  const finish = async (sp, text) => {
    if (!text?.trim()) { setError('لم نسمع كلاماً واضحاً، حاول مجدداً.'); return; }
    setBusy(sp.id);
    try { await translateAll(sp, text.trim()); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };

  const toggle = async (sp) => {
    setError('');
    if (live === sp.id) {
      setLive(null);
      if (serverStt) {
        const r = await clipRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clipRef.current = null;
        if (!r || r.ms < 500) { setError('التسجيل قصير جداً'); return; }
        setBusy(sp.id);
        try { const { data } = await sendAudio(api, '/translate/stt', r.blob, r.mime, { language: sp.lang }); await finish(sp, data.data.text); }
        catch (e) { setError(errMsg(e)); setBusy(null); }
      } else recRef.current?.stop();
      return;
    }
    if (live) return;
    if (serverStt) {
      try { streamRef.current = await getMic(); clipRef.current = recordClip(streamRef.current); setLive(sp.id); }
      catch { setError('اسمح للمتصفح باستخدام الميكروفون'); }
      return;
    }
    if (!browserSpeechSupported) { setError('التعرف على الصوت غير متاح في هذا المتصفح. استخدم Chrome أو فعّل GROQ_API_KEY في الخادم.'); return; }
    let finalText = '';
    const rec = createRecognizer({
      lang: sp.lang,
      onFinal: (t) => { finalText = t; },
      onError: (c) => setError(c === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : `خطأ: ${c}`),
      onEnd: () => { setLive(null); if (finalText) finish(sp, finalText); },
    });
    recRef.current = rec; setLive(sp.id); rec.start();
  };

  const lastFor = (sp) => { // آخر ما قاله غيري، بلغتي
    for (let i = feed.length - 1; i >= 0; i--) {
      const m = feed[i];
      if (m.speakerId === sp.id) continue;
      return m.lang === sp.lang ? m.text : m.translations[sp.lang];
    }
    return '';
  };

  return (
    <>
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ margin: 0 }}>كل متكلم يضغط ميكروفونه ويتكلم بلغته؛ يُترجم كلامه لبقية اللغات ويظهر لكل متكلم بلغته.</p>
        <button className="btn small ghost" onClick={() => setSpeakOn((v) => !v)}>{speakOn ? <Volume2 /> : <VolumeX />} {speakOn ? 'النطق مفعّل' : 'النطق متوقف'}</button>
      </div>

      <div className="grid cols-2">
        {speakers.map((sp) => (
          <section key={sp.id} className={`card speaker${live === sp.id ? ' live' : ''}`}>
            <div className="row between">
              <input className="input" style={{ maxWidth: 140 }} value={sp.name} maxLength={20} onChange={(e) => update(sp.id, { name: e.target.value })} aria-label="اسم المتكلم" />
              <div style={{ width: 170 }}><LanguageSelect value={sp.lang} onChange={(v) => update(sp.id, { lang: v })} id={`g-${sp.id}`} /></div>
              {speakers.length > 2 && <button className="btn small ghost" onClick={() => setSpeakers((l) => l.filter((x) => x.id !== sp.id))} aria-label="حذف"><X /></button>}
            </div>
            <div className="speaker-text" style={{ minHeight: 70 }}>{lastFor(sp) || <span className="muted">هنا يظهر ما يقوله الآخرون بلغتك ({langName(sp.lang)})</span>}</div>
            <button className={`mic${live === sp.id ? ' live' : ''}`} disabled={!!busy || (!!live && live !== sp.id)} onClick={() => toggle(sp)} aria-label={sp.name}>
              {busy === sp.id ? <LoaderCircle className="spin" /> : live === sp.id ? <Square /> : <Mic />}
            </button>
          </section>
        ))}
      </div>

      {speakers.length < MAX && <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setSpeakers((l) => [...l, { id: ++uid, name: `متكلم ${l.length + 1}`, lang: FALLBACK.find((c) => !l.some((x) => x.lang === c)) || 'en' }])}><Plus /> إضافة متكلم</button>}

      {feed.length > 0 && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <strong>سجل المحادثة</strong>
          {feed.slice().reverse().map((m) => (
            <div key={m.id} className="reply">
              <small>{m.name} · {langName(m.lang)}</small>
              <p>{m.text}</p>
              {Object.entries(m.translations).map(([l, t]) => t && <p key={l} className="muted"><b>{langName(l)}:</b> {t}</p>)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
