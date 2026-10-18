import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, CircleCheck, BookA, Languages, LoaderCircle, Clock, Sparkles, TriangleAlert } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LanguageSelect, PageHeader, Empty } from '../../components/ui';

export const CATEGORY_LABELS = {
  tribal: 'لغات ورطانات السودان',
  sudanese_arabic: 'اللهجات العربية السودانية',
  other_arabic: 'لهجات عربية أخرى',
};
const ORDER = ['tribal', 'sudanese_arabic', 'other_arabic'];

function GroupOptions({ groups }) {
  return ORDER.map((cat) => {
    const list = groups.filter((g) => g.category === cat);
    return list.length ? <optgroup key={cat} label={CATEGORY_LABELS[cat]}>{list.map((g) => <option key={g.name} value={g.name}>{g.name}{g.count ? ` (${g.count})` : ''}</option>)}</optgroup> : null;
  });
}

export default function Dialects() {
  const [q, setQ] = useState('');
  const [dialect, setDialect] = useState('');
  const [groups, setGroups] = useState([]);
  const [entries, setEntries] = useState([]);
  const [adding, setAdding] = useState(null); // { word?, dialect? }
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const loadGroups = useCallback(() => api.get('/dialects').then((r) => setGroups(r.data.dialects)).catch(() => {}), []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const search = useCallback(async () => {
    try {
      const { data } = await api.get('/dialects/search', { params: { q: q || undefined, dialect: dialect || undefined } });
      setEntries(data.entries);
    } catch (e) { setError(errMsg(e)); }
  }, [q, dialect]);
  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t); }, [search]);

  const current = groups.find((g) => g.name === dialect);

  return (
    <>
      <PageHeader eyebrow="اللهجات المحلية والرطانات" title="رطانات ولهجات السودان" subtitle="ترجمة رطانات الفلاتة والبرقو والهوسا والتامة وغيرها إلى العربية، بقاموس يبنيه أهلها ويعتمده المشرفون.">
        <button className="btn primary" onClick={() => setAdding({})}><Plus /> إضافة كلمة</button>
      </PageHeader>
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}
      {toast && <div className="alert info" style={{ marginBottom: 12 }}>{toast}</div>}

      <Translator groups={groups} onAddWord={(word, d) => setAdding({ word, dialect: d })} />

      <div className="row" style={{ margin: '24px 0 10px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={18} style={{ position: 'absolute', top: 14, right: 14, color: '#8a8573' }} />
          <input className="input" style={{ paddingInlineStart: 42 }} placeholder="ابحث عن كلمة أو معنى…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto', minWidth: 190 }} value={dialect} onChange={(e) => setDialect(e.target.value)} aria-label="المجموعة">
          <option value="">كل المجموعات</option>
          <GroupOptions groups={groups} />
        </select>
      </div>
      {current && (
        <p className="muted" style={{ marginBottom: 10 }}>
          {current.description || current.name}{current.region ? ` — ${current.region}` : ''} · {current.count} مصطلح معتمد
          {current.count === 0 && ' · لا توجد كلمات بعد، كن أول من يضيف!'}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="card"><Empty icon={BookA}>لا توجد مصطلحات مطابقة. أضف كلمة بالضغط على «إضافة كلمة».</Empty></div>
      ) : (
        <div className="grid cols-3">
          {entries.map((e) => (
            <article key={e._id} className="card entry">
              <div className="row between"><h3>{e.word}</h3><span className="tag">{e.dialect}</span></div>
              <p>{e.standardMeaning}</p>
              {e.variants?.length > 0 && <small className="muted">وتُكتب أيضاً: {e.variants.join('، ')}</small>}
              <div>{e.status === 'approved'
                ? <span className="verified"><CircleCheck size={14} /> معتمد</span>
                : <span className="pending"><Clock size={14} /> اقتراحك قيد المراجعة</span>}</div>
              {e.examples?.[0] && <div className="ex">مثال: {e.examples[0]}</div>}
            </article>
          ))}
        </div>
      )}

      {adding && <AddEntry groups={groups} preset={adding} onClose={() => setAdding(null)} onDone={(msg) => { setAdding(null); setToast(msg); loadGroups(); search(); }} />}
    </>
  );
}

function Translator({ groups, onAddWord }) {
  const [dialect, setDialect] = useState('');
  const [toDialect, setToDialect] = useState('');
  const [input, setInput] = useState('');
  const [target, setTarget] = useState('ar');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!dialect && groups.length) setDialect((groups.find((g) => g.count > 0) || groups[0]).name); }, [groups, dialect]);

  const run = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/dialects/translate', { text: input, dialect, to: target, toDialect: toDialect || undefined });
      setResult({ ...data.data, dialect });
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card stack">
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="dl">من الرطانة / اللهجة</label>
          <select id="dl" className="select" value={dialect} onChange={(e) => setDialect(e.target.value)}><GroupOptions groups={groups} /></select>
        </div>
        <LanguageSelect id="tl" label="إلى لغة" value={target} onChange={setTarget} />
        <div className="field" style={{ minWidth: 170 }}>
          <label htmlFor="td">وبلهجة (اختياري)</label>
          <select id="td" className="select" value={toDialect} onChange={(e) => setToDialect(e.target.value)}>
            <option value="">لغة قياسية</option>
            <GroupOptions groups={groups.filter((g) => g.category !== 'tribal' || g.count > 0)} />
          </select>
        </div>
      </div>
      <textarea className="textarea" placeholder="اكتب العبارة بالرطانة أو اللهجة…" value={input} onChange={(e) => setInput(e.target.value)} />
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !input.trim() || !dialect} onClick={run}>
        {busy ? <LoaderCircle className="spin" /> : <Languages />} ترجمة
      </button>
      {error && <div className="alert error">{error}</div>}

      {result && (
        <div className="stack">
          {result.warning && <div className="alert info"><TriangleAlert size={14} /> {result.warning}</div>}
          <div className="grid cols-2">
            <div className="alert info"><small>{result.mode === 'glossary' ? 'المعنى كلمة بكلمة' : 'النص بعد التوحيد'}</small><p style={{ fontSize: '1.1rem' }}>{result.standard || '—'}</p></div>
            <div className="alert info">
              <small>الترجمة {result.engine?.includes('ai') && <span className="chip" style={{ marginInlineStart: 6 }}><Sparkles size={12} /> ذكاء اصطناعي</span>}</small>
              <p style={{ fontSize: '1.1rem' }}>{result.translation || '—'}</p>
            </div>
          </div>
          {result.mode === 'glossary' && (
            <div>
              <small className="muted">تغطية القاموس {result.coverage}% ({result.entries} مصطلح)</small>
              <div className={`coverage${result.coverage < 50 ? ' low' : ''}`}><i style={{ width: `${result.coverage}%` }} /></div>
            </div>
          )}
          {result.unknown?.length > 0 && (
            <div>
              <small className="muted">كلمات لا نعرف معناها — اضغط على الكلمة لتضيف معناها وتحسّن القاموس:</small>
              <div className="chips" style={{ marginTop: 6 }}>
                {result.unknown.map((w) => <button key={w} className="chip unknown-chip" onClick={() => onAddWord(w, result.dialect)}><Plus size={12} /> {w}</button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddEntry({ groups, preset, onClose, onDone }) {
  const [f, setF] = useState({ word: preset.word || '', dialect: preset.dialect || '', standardMeaning: '', variants: '', example: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/dialects', {
        word: f.word, dialect: f.dialect, standardMeaning: f.standardMeaning,
        variants: f.variants.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
        examples: f.example ? [f.example] : [],
      });
      onDone(data.message);
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ fontSize: '1.2rem' }}>إضافة كلمة إلى القاموس</h2>
        <div className="field">
          <label htmlFor="ag">اللغة / اللهجة</label>
          <select id="ag" className="select" value={f.dialect} onChange={set('dialect')} required><option value="" disabled>اختر…</option><GroupOptions groups={groups} /></select>
        </div>
        <input className="input" placeholder="الكلمة أو العبارة بالرطانة" value={f.word} onChange={set('word')} required />
        <input className="input" placeholder="المعنى بالعربية" value={f.standardMeaning} onChange={set('standardMeaning')} required />
        <input className="input" placeholder="تهجئات أخرى لنفس الكلمة (اختياري، تفصلها فاصلة)" value={f.variants} onChange={set('variants')} />
        <input className="input" placeholder="مثال في جملة (اختياري)" value={f.example} onChange={set('example')} />
        <p className="muted" style={{ fontSize: '0.85rem' }}>تُراجَع الإضافات قبل اعتمادها حفاظاً على جودة القاموس. اكتب الكلمة كما تُنطق، ويمكنك استخدام الحروف العربية أو اللاتينية.</p>
        {error && <div className="alert error">{error}</div>}
        <div className="row"><button className="btn primary">إرسال</button><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button></div>
      </form>
    </div>
  );
}
