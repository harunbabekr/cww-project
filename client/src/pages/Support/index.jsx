import { useCallback, useEffect, useRef, useState } from 'react';
import { Star, Send, LifeBuoy, Mic, Square, LoaderCircle } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getMic, recordClip, recordingSupported, sendAudio } from '../../lib/recorder';
import { useFeatures } from '../../lib/features';
import { Empty, LanguageSelect, PageHeader } from '../../components/ui';

const STATUS = { open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'تم الحل', closed: 'مغلقة' };

export default function Support() {
  const { user } = useAuth();
  const features = useFeatures();
  const [form, setForm] = useState({ subject: '', message: '', language: user.settings.speakLanguage });
  const [tickets, setTickets] = useState([]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [summary, setSummary] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [rec, setRec] = useState('idle'); // idle | recording | processing
  const clip = useRef(null);
  const stream = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    try {
      const [t, r, s] = await Promise.all([api.get('/support/tickets/mine'), api.get('/support/rating'), api.get('/support/rating/summary')]);
      setTickets(t.data.tickets);
      if (r.data.rating) { setStars(r.data.rating.stars); setComment(r.data.rating.comment || ''); }
      setSummary(s.data);
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // رسالة صوتية: تسجيل ← نص يُضاف إلى الرسالة (ثم تُترجم للعربية عند الإرسال)
  const toggleVoice = async () => {
    if (rec === 'recording') {
      setRec('processing');
      const r = await clip.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      try {
        const { data } = await sendAudio(api, '/translate/stt', r.blob, r.mime, { language: form.language });
        if (data.data.text) setForm((f) => ({ ...f, message: `${f.message}${f.message ? ' ' : ''}${data.data.text}` }));
        else setError('لم نفهم التسجيل، حاول مجدداً');
      } catch (e) { setError(errMsg(e)); }
      setRec('idle');
      return;
    }
    try { stream.current = await getMic(); clip.current = recordClip(stream.current); setRec('recording'); setError(''); }
    catch { setError('اسمح للمتصفح باستخدام الميكروفون'); }
  };

  const sendTicket = async (e) => {
    e.preventDefault();
    try {
      await api.post('/support/tickets', form);
      setForm((f) => ({ ...f, subject: '', message: '' }));
      flash('تم إرسال رسالتك');
      load();
    } catch (err) { setError(errMsg(err)); }
  };

  const rate = async () => {
    try { await api.put('/support/rating', { stars, comment }); flash('شكراً لتقييمك'); load(); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <>
      <PageHeader eyebrow="تواصل معنا" title="نسمعك دائماً" subtitle="اكتب أو سجّل رسالة بلغتك، وتُترجم تلقائياً لإدارة التطبيق، ويصلك الرد بلغتك." />
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="grid cols-2">
        <form className="card stack" onSubmit={sendTicket}>
          <h2 style={{ fontSize: '1.15rem' }}>رسالة إلى إدارة التطبيق</h2>
          <LanguageSelect id="ml" label="لغة الرسالة" value={form.language} onChange={(v) => setForm((f) => ({ ...f, language: v }))} />
          <input className="input" placeholder="الموضوع" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required />
          <textarea className="textarea" placeholder="اكتب رسالتك…" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required />
          <div className="row">
            <button className="btn primary"><Send /> إرسال</button>
            {(features.stt?.available) && recordingSupported() && (
              <button type="button" className={`btn ghost${rec === 'recording' ? ' danger' : ''}`} onClick={toggleVoice} disabled={rec === 'processing'}>
                {rec === 'processing' ? <LoaderCircle className="spin" /> : rec === 'recording' ? <Square /> : <Mic />}
                {rec === 'recording' ? 'إيقاف التسجيل' : 'رسالة صوتية'}
              </button>
            )}
          </div>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: '1.15rem' }}>قيّم التطبيق</h2>
          <div className="stars" role="radiogroup" aria-label="التقييم">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= stars ? 'on' : ''} onClick={() => setStars(n)} aria-label={`${n} نجوم`}><Star fill={n <= stars ? 'currentColor' : 'none'} /></button>
            ))}
          </div>
          <textarea className="textarea" style={{ minHeight: 80 }} placeholder="رأيك ومقترحاتك (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!stars} onClick={rate}>حفظ التقييم</button>
          {summary?.count > 0 && <small className="muted">متوسط تقييم المستخدمين {summary.average} من 5 ({summary.count} تقييم)</small>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: 8 }}>رسائلي السابقة</h2>
        {tickets.length === 0 ? <Empty icon={LifeBuoy}>لا توجد رسائل سابقة</Empty> : tickets.map((t) => (
          <div key={t._id} className="ticket">
            <div className="row between"><strong>{t.subject}</strong><span className={`status ${t.status}`}>{STATUS[t.status]}</span></div>
            <p className="muted">{t.message}</p>
            {t.reply && <div className="reply"><small>رد الإدارة</small><p>{t.replyTranslated || t.reply}</p></div>}
          </div>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
