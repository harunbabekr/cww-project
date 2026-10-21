import { useEffect, useRef, useState } from 'react';
import { Mic, Square, ArrowLeftRight, Languages, Volume2, LoaderCircle, ShieldCheck, RotateCcw, Wand2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api, { errMsg } from '../../services/api';
import { useFeatures } from '../../lib/features';
import { getMic, recordClip, recordingSupported, sendAudio } from '../../lib/recorder';
import { createRecognizer, browserSpeechSupported } from '../../lib/browserSpeech';
import { say, hasBrowserVoice } from '../../lib/audio';
import { LANGUAGES, langName } from '../../lib/languages';
import { LanguageSelect, PageHeader } from '../../components/ui';
import Group from './Group';

const supported = (c) => LANGUAGES.some((l) => l.code === c);
const COMMON = ['en', 'ar', 'ha', 'fr', 'sw'];

function Pair() {
  const { user } = useAuth();
  const features = useFeatures();
  const s = user.settings;

  const [lang, setLang] = useState({ a: s.speakLanguage, b: s.targetLanguage });
  const [text, setText] = useState({ a: '', b: '' });
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [last, setLast] = useState('a');
  const [suggest, setSuggest] = useState(null); // { lang } — لغة اكتُشفت للمتكلم الآخر
  const [check, setCheck] = useState(null); // نتيجة التحقق من الدقة
  const [checking, setChecking] = useState(false);
  const [retry, setRetry] = useState(null);

  const clipRef = useRef(null);
  const streamRef = useRef(null);
  const browserRec = useRef(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const serverStt = features.stt?.available && recordingSupported();

  useEffect(() => () => {
    browserRec.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const resetResult = () => { setCheck(null); setSuggest(null); setNote(''); setError(''); setRetry(null); };

  const speakOut = async (translated, targetLang, audio) => {
    const ok = await say({ text: translated, lang: targetLang, audio });
    if (ok === false || (!audio && !hasBrowserVoice(targetLang))) setNote('لا يتوفر صوت لنطق هذه اللغة على جهازك — الترجمة معروضة نصاً فقط.');
  };

  // التحديد الآلي: للمتكلم الآخر فقط، ومقيّد بلغات مرجّحة. لغة المتكلم نفسه تُؤخذ دائماً مما اخترتَه.
  const fromFor = (side) => (side === 'b' && s.autoDetect ? 'auto' : langRef.current[side]);
  const candidatesFor = () => [...new Set([langRef.current.b, s.targetLanguage, s.speakLanguage, ...COMMON])].join(',');

  const convertText = async (side, source) => {
    const original = (source ?? '').trim();
    if (!original) return;
    const other = side === 'a' ? 'b' : 'a';
    setBusy(true); resetResult();
    try {
      const { data } = await api.post('/translate/text', { text: original, from: fromFor(side), to: langRef.current[other] });
      const translated = data.data.translated;
      setText({ [side]: original, [other]: translated });
      setLast(side);
      let audio = null;
      if (features.tts?.available) {
        try { audio = (await api.post('/translate/tts', { text: translated, language: langRef.current[other], myVoice: side === 'a' })).data.data.audio; } catch { /* صوت المتصفح */ }
      }
      speakOut(translated, langRef.current[other], audio);
    } catch (e) { setError(errMsg(e)); setRetry(() => () => convertText(side, original)); } finally { setBusy(false); }
  };

  const processAudio = async (side, clip) => {
    const other = side === 'a' ? 'b' : 'a';
    const l = langRef.current;
    setBusy(true); resetResult();
    try {
      const params = { from: fromFor(side), to: l[other], myVoice: side === 'a' ? '1' : '0' };
      if (params.from === 'auto') params.candidates = candidatesFor();
      const { data } = await sendAudio(api, '/translate/speech', clip.blob, clip.mime, params);
      const d = data.data;
      if (d.empty) { setError('لم نسمع كلاماً واضحاً، حاول مجدداً وقرّب الميكروفون.'); setRetry(() => () => toggle(side)); return; }
      setText({ [side]: d.recognized, [other]: d.translated });
      setConfidence(d.confidence);
      setLast(side);
      // لا نغيّر لغتك أبداً. نقترح فقط إن اكتُشفت لغة مختلفة للمتكلم الآخر.
      if (side === 'b' && s.autoDetect && d.detectedLanguage && d.detectedLanguage !== l.b && supported(d.detectedLanguage)) setSuggest({ lang: d.detectedLanguage });
      if (d.rejectedDetection) setNote('لم نتأكد من لغة الكلام فاعتمدنا اللغة المحددة في القائمة.');
      speakOut(d.translated, l[other], d.audio);
    } catch (e) { setError(errMsg(e)); setRetry(() => () => processAudio(side, clip)); } finally { setBusy(false); }
  };

  const toggle = async (side) => {
    setError('');
    if (live === side) {
      setLive(null);
      if (serverStt) {
        const r = await clipRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clipRef.current = null;
        if (r && r.ms > 500) processAudio(side, r); else setError('التسجيل قصير جداً');
      } else browserRec.current?.stop();
      return;
    }
    if (live) return;
    setText({ a: '', b: '' }); setConfidence(null); setLast(side); resetResult();

    if (serverStt) {
      try { streamRef.current = await getMic(); clipRef.current = recordClip(streamRef.current); setLive(side); }
      catch { setError('اسمح للمتصفح باستخدام الميكروفون'); }
      return;
    }
    if (!browserSpeechSupported) return setError('التعرف على الصوت غير مفعّل: أضف GROQ_API_KEY في الخادم، أو استخدم Chrome/Edge، أو اكتب النص ثم اضغط «تحويل».');
    let finalText = '';
    const rec = createRecognizer({
      lang: lang[side],
      onText: (t) => setText((x) => ({ ...x, [side]: t })),
      onFinal: (t, c) => { finalText = t; setConfidence(c); setText((x) => ({ ...x, [side]: t })); },
      onError: (c) => setError(c === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : `خطأ في التعرف على الصوت: ${c}`),
      onEnd: () => { setLive(null); if (finalText) convertText(side, finalText); },
    });
    browserRec.current = rec; setLive(side); rec.start();
  };

  const verify = async () => {
    const other = last === 'a' ? 'b' : 'a';
    setChecking(true); setCheck(null);
    try {
      const { data } = await api.post('/translate/verify', { text: text[last], from: langRef.current[last], to: langRef.current[other], translated: text[other] });
      setCheck(data.data);
    } catch (e) { setError(errMsg(e)); } finally { setChecking(false); }
  };

  const useSuggestion = () => {
    const other = last === 'a' ? 'b' : 'a';
    setText((t) => ({ ...t, [other]: check.suggestion }));
    speakOut(check.suggestion, langRef.current[other], null);
    setCheck(null);
  };

  const swap = () => { setLang((l) => ({ a: l.b, b: l.a })); setText((t) => ({ a: t.b, b: t.a })); resetResult(); };

  const renderSpeaker = (side, title) => (
    <section key={side} className={`card speaker${live === side ? ' live' : ''}`}>
      <div className="row between">
        <h2 style={{ fontSize: '1.1rem' }}>{title}</h2>
        <div className="lang-pick"><LanguageSelect value={lang[side]} onChange={(v) => { setLang((l) => ({ ...l, [side]: v })); setSuggest(null); }} id={`lang-${side}`} /></div>
      </div>
      <textarea
        className={`speaker-text textarea${text[side] ? '' : ' placeholder'}`}
        style={{ border: 0, background: 'transparent', padding: 0 }}
        value={text[side]}
        onChange={(e) => setText((t) => ({ ...t, [side]: e.target.value }))}
        placeholder="اضغط الميكروفون وتكلّم، أو اكتب هنا…"
      />
      <button className={`mic${live === side ? ' live' : ''}`} disabled={busy || (!!live && live !== side)} onClick={() => toggle(side)} aria-label={live === side ? 'إيقاف وترجمة' : title}>
        {busy && last === side ? <LoaderCircle className="spin" /> : live === side ? <Square /> : <Mic />}
      </button>
      <small className="muted" style={{ textAlign: 'center' }}>
        {live === side ? 'جارٍ التسجيل… اضغط للإيقاف والترجمة' : side === 'b' && s.autoDetect ? 'اضغط للتكلّم (لغة المتكلم الآخر تُحدَّد تلقائياً)' : 'اضغط للتكلّم'}
      </small>
    </section>
  );

  const other = last === 'a' ? 'b' : 'a';
  const score = check?.score ?? (confidence != null ? Math.round(confidence * 100) : null);
  return (
    <>
      <PageHeader eyebrow="المحادثة في الواقع" title="تحدّث وجهاً لوجه" subtitle="كل طرف يضغط زر الميكروفون الخاص به، وعند الإيقاف تُترجم وتُنطق الترجمة للطرف الآخر." />
      {error && (
        <div className="alert error row between" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          {retry && <button className="btn small ghost" onClick={retry}><RotateCcw /> إعادة المحاولة</button>}
        </div>
      )}
      {note && <div className="alert info" style={{ marginBottom: 16 }}>{note}</div>}
      {suggest && (
        <div className="alert info row between" style={{ marginBottom: 16 }}>
          <span>بدا أن المتكلم الآخر تكلّم بـ <b>{langName(suggest.lang)}</b>. هل تريد تعيينها للمتكلم الآخر؟</span>
          <button className="btn small primary" onClick={() => { setLang((l) => ({ ...l, b: suggest.lang })); setSuggest(null); }}>تعيين</button>
        </div>
      )}

      <div className="grid cols-2">
        {renderSpeaker('a', 'المتكلم')}
        {renderSpeaker('b', 'المتكلم الآخر')}
      </div>

      <div className="convert-bar">
        <button className="btn ghost" onClick={swap}><ArrowLeftRight /> تبديل اللغتين</button>
        <button className="btn primary" disabled={busy || !text[last]?.trim() || !!live} onClick={() => convertText(last, text[last])}>
          <Languages /> {busy ? 'جارٍ الترجمة…' : 'تحويل'}
        </button>
        <button className="btn ghost" disabled={!text[other]} onClick={() => speakOut(text[other], lang[other], null)}><Volume2 /> إعادة النطق</button>
        <button className="btn ghost" disabled={!text[other] || !text[last] || checking} onClick={verify}>
          {checking ? <LoaderCircle className="spin" /> : <ShieldCheck />} تحقق من الدقة
        </button>
        <div className="accuracy" title={check ? 'تقييم جودة الترجمة' : 'مستوى ثقة التعرف على الكلام'}>
          <small className="muted">دقة الترجمة</small>
          <div className="meter"><i style={{ width: `${score ?? 0}%` }} /></div>
          <b>{score != null ? `${score}%` : '—'}</b>
        </div>
      </div>

      {check && (
        <div className={`card stack ${check.score >= 75 ? '' : 'check-warn'}`}>
          <div className="row between"><strong>مراجعة الترجمة: {check.score}%</strong><small className="muted">{check.method === 'ai' ? 'بالذكاء الاصطناعي' : 'بالترجمة العكسية (تقريبي)'}</small></div>
          {check.issues?.length > 0 && <ul style={{ paddingInlineStart: 18 }}>{check.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
          {check.backTranslation && <p className="muted">الترجمة العكسية: {check.backTranslation}</p>}
          {check.suggestion && (
            <div className="reply">
              <small>صياغة مقترحة</small><p>{check.suggestion}</p>
              <button className="btn small primary" onClick={useSuggestion}><Wand2 /> استخدم الاقتراح</button>
            </div>
          )}
        </div>
      )}
      {s.voiceClone && <p className="muted" style={{ textAlign: 'center' }}>محاكاة الصوت مفعّلة: تُنطق ترجمة «المتكلم» بصوتك. أما «المتكلم الآخر» فبصوت افتراضي لأن استنساخ صوته يحتاج موافقته.</p>}
    </>
  );
}

export default function RealTimeFaceToFace() {
  const [mode, setMode] = useState('pair');
  return (
    <>
      <div className="tabs">
        <button type="button" className={mode === 'pair' ? 'active' : ''} onClick={() => setMode('pair')}>شخصان</button>
        <button type="button" className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')}>جماعي (حتى 6)</button>
      </div>
      {mode === 'pair' ? <Pair /> : (
        <>
          <PageHeader eyebrow="المحادثة في الواقع" title="محادثة جماعية وجهاً لوجه" />
          <Group />
        </>
      )}
    </>
  );
}
