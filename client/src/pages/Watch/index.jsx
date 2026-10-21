import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Play, Eye, ArrowRight, Clapperboard, Volume2 } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { langName } from '../../lib/languages';
import { speak, hasBrowserVoice, stopAll } from '../../lib/audio';
import { Empty, PageHeader } from '../../components/ui';

const CATS = [{ id: '', label: 'الكل' }, { id: 'lecture', label: 'محاضرات' }, { id: 'movie', label: 'أفلام' }, { id: 'series', label: 'مسلسلات' }, { id: 'other', label: 'أخرى' }];
const Thumb = ({ v }) => (v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" /> : <div className="ph"><Play /></div>);

export default function Watch() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/watch', { params: { q: q || undefined, category: cat || undefined } });
      setVideos(data.videos);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [q, cat]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const open = async (id) => {
    try {
      const { data } = await api.get(`/watch/${id}`);
      setSelected({ video: data.video, related: data.related });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(errMsg(e)); }
  };

  if (selected) {
    return (
      <>
        <button className="btn ghost small" onClick={() => { stopAll(); setSelected(null); }} style={{ marginBottom: 16 }}><ArrowRight /> رجوع للمشاهدات</button>
        {error && <div className="alert error">{error}</div>}
        <div className="watch">
          <Player key={selected.video._id} video={selected.video} myLang={user.settings.speakLanguage} />
          <aside className="stack">
            <strong>فيديوهات ذات صلة</strong>
            {selected.related.length === 0 && <p className="muted">لا توجد فيديوهات مشابهة بعد.</p>}
            {selected.related.map((v) => (
              <button key={v._id} className="vthumb" onClick={() => open(v._id)}><Thumb v={v} /><span><strong>{v.title}</strong><small className="muted">{v.views} مشاهدة</small></span></button>
            ))}
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="المشاهدات" title="شاهد بلغتك" subtitle="محاضرات وأفلام بترجمة نصية ودبلجة صوتية بلغتك." />
      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={18} style={{ position: 'absolute', top: 14, right: 14, color: '#8a8573' }} />
          <input className="input" style={{ paddingInlineStart: 42 }} placeholder="ابحث عن فيديو…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">{CATS.map((c) => <button key={c.id} className={`chip${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
      </div>
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}
      {!loading && videos.length === 0 ? (
        <div className="card"><Empty icon={Clapperboard}>لا توجد فيديوهات بعد. يضيفها المشرفون من لوحة الإدارة.</Empty></div>
      ) : (
        <div className="grid cols-3 video-grid">
          {videos.map((v) => (
            <button key={v._id} className="vcard" onClick={() => open(v._id)}>
              <Thumb v={v} />
              <strong>{v.title}</strong>
              <span className="row muted" style={{ fontSize: '0.8rem', flexWrap: 'wrap' }}>
                <Eye size={14} /> {v.views} · {langName(v.originalLanguage)}
                {v.languages?.length > 0 && <span className="chip">{v.languages.length} لغات</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const vttTime = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(3);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
};
const toVtt = (segs) => `WEBVTT\n\n${segs.map((s, i) => `${i + 1}\n${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.text}\n`).join('\n')}`;

function Player({ video, myLang }) {
  const [langs, setLangs] = useState(video.languages || []);
  const [job, setJob] = useState(null); // null | 'sending' | 'processing'
  const [choice, setChoice] = useState(langs.includes(myLang) ? `dub:${myLang}` : 'orig');
  const [segments, setSegments] = useState([]);
  const [vtt, setVtt] = useState('');
  const [msg, setMsg] = useState('');
  const vRef = useRef(null);

  const [kind, lang] = choice.split(':');

  // طلب ترجمة بلغتي ثم متابعة الحالة حتى تجهز
  const requestMine = async () => {
    setMsg(''); setJob('sending');
    try { await api.post(`/watch/${video._id}/request`, { language: myLang }); setJob('processing'); }
    catch (e) { setMsg(errMsg(e)); setJob(null); }
  };
  useEffect(() => {
    if (job !== 'processing') return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/watch/${video._id}/status`);
        const mine = data.jobs.find((j) => j.language === myLang);
        if (data.languages.includes(myLang)) { setLangs(data.languages); setChoice(`dub:${myLang}`); setJob(null); }
        else if (mine?.status === 'failed') { setMsg('تعذّرت معالجة الترجمة، حاول لاحقاً.'); setJob(null); }
      } catch { /* نعيد المحاولة */ }
    }, 8000);
    return () => clearInterval(t);
  }, [job, video._id, myLang]);

  // تحميل مقاطع اللغة المختارة
  useEffect(() => {
    setSegments([]); setMsg('');
    if (kind === 'orig') return undefined;
    let url = '';
    api.get(`/watch/${video._id}/track/${lang}`).then((r) => {
      setSegments(r.data.segments);
      url = URL.createObjectURL(new Blob([toVtt(r.data.segments)], { type: 'text/vtt' }));
      setVtt(url);
    }).catch((e) => setMsg(errMsg(e)));
    return () => { if (url) URL.revokeObjectURL(url); setVtt(''); };
  }, [kind, lang, video._id]);

  // الترجمة النصية: تفعيل المسار
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    [...v.textTracks].forEach((t) => { t.mode = kind !== 'orig' && vtt ? 'showing' : 'disabled'; });
  }, [vtt, kind]);

  // الدبلجة: نطق المقاطع بصوت الجهاز متزامناً مع الفيديو
  useEffect(() => {
    const v = vRef.current;
    if (!v || kind !== 'dub' || !segments.length) return undefined;
    if (!hasBrowserVoice(lang)) { setMsg('جهازك لا يملك صوتاً لنطق هذه اللغة، فتُعرض الترجمة نصاً فقط.'); return undefined; }

    let idx = -1, raf = 0;
    const find = (t) => segments.findIndex((s) => t >= s.start && t < s.end);
    const tick = () => {
      if (!v.paused) {
        const i = find(v.currentTime);
        if (i !== -1 && i !== idx) {
          idx = i;
          const s = segments[i];
          speak(s.text, lang);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const onSeek = () => { idx = -1; stopAll(); };
    const onPause = () => stopAll();
    v.volume = 0.12;
    v.addEventListener('seeking', onSeek); v.addEventListener('pause', onPause);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('seeking', onSeek); v.removeEventListener('pause', onPause); v.volume = 1; stopAll(); };
  }, [kind, lang, segments]);

  return (
    <div className="stack">
      <div className="player">
        <video ref={vRef} src={video.videoUrl} controls playsInline poster={video.thumbnailUrl}>
          {vtt && <track key={vtt} kind="subtitles" srcLang={lang} label={langName(lang)} src={vtt} default />}
        </video>
      </div>
      <div className="card stack">
        <h2 style={{ fontSize: '1.3rem' }}>{video.title}</h2>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label htmlFor="dub" className="muted">لغة المشاهدة</label>
          <select id="dub" className="select" style={{ width: 'auto' }} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="orig">الأصلية ({langName(video.originalLanguage)})</option>
            {langs.map((l) => <option key={`d${l}`} value={`dub:${l}`}>دبلجة صوتية — {langName(l)}</option>)}
            {langs.map((l) => <option key={`s${l}`} value={`sub:${l}`}>ترجمة نصية — {langName(l)}</option>)}
          </select>
          <span className="muted"><Eye size={14} /> {video.views}</span>
          {kind === 'dub' && <span className="chip"><Volume2 size={14} /> دبلجة بصوت الجهاز</span>}
        </div>
        {!langs.includes(myLang) && video.originalLanguage !== myLang && (
          <div className="alert info row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span>لا توجد ترجمة أو دبلجة بلغتك ({langName(myLang)}) لهذا الفيديو بعد.{job === 'processing' ? ' جارٍ تجهيزها، قد يستغرق بضع دقائق…' : ''}</span>
            <button className="btn small primary" disabled={!!job} onClick={requestMine}>{job ? 'جارٍ التجهيز…' : 'اطلب الترجمة بلغتي'}</button>
          </div>
        )}
        {msg && <div className="alert info">{msg}</div>}
        {video.description && <p className="muted">{video.description}</p>}
      </div>
    </div>
  );
}
