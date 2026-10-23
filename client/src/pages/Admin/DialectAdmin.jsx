import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, Plus, Search, PencilLine, Trash2, LoaderCircle, BookA, ListChecks, ChevronDown, Layers } from 'lucide-react';
import api, { errMsg } from '../../services/api';
import { langName } from '../../lib/languages';
import { Empty, ConfirmButton } from '../../components/ui';
import EntryEditor from '../../components/EntryEditor';
import { GroupOptions, STATUS_LABEL } from '../../lib/dialectUi';

export const CAT = { tribal: 'لغة / رطانة', sudanese_arabic: 'لهجة عربية سودانية', other_arabic: 'لهجة عربية أخرى' };
const STATUS_FILTERS = [['', 'الكل'], ['approved', 'معتمد'], ['pending', 'بانتظار'], ['rejected', 'مرفوض']];

function useGroups(all = true) {
  const [groups, setGroups] = useState([]);
  const load = useCallback(() => api.get('/dialects', { params: all ? { all: 1 } : {} }).then((r) => setGroups(r.data.dialects)).catch(() => {}), [all]);
  useEffect(() => { load(); }, [load]);
  return [groups, load];
}

/* ------------------------------------------------------------------ */
/*  مراجعة الاقتراحات                                                   */
/* ------------------------------------------------------------------ */
export function DialectReview() {
  const [items, setItems] = useState([]);
  const [groups] = useGroups();
  const [meaning, setMeaning] = useState({});
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/dialects/pending').then((r) => setItems(r.data.entries)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const review = async (id, status) => {
    try { await api.patch(`/dialects/${id}/review`, { status, standardMeaning: meaning[id] }); setItems((x) => x.filter((e) => e._id !== id)); }
    catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="card">
      {error && <div className="alert error">{error}</div>}
      {items.length === 0 ? <Empty icon={Check}>لا توجد اقتراحات بانتظار المراجعة</Empty> : items.map((e) => (
        <div key={e._id} className="entry-row">
          <div className="entry-main">
            <div className="entry-title"><strong>{e.word}</strong><span className="tag">{e.dialect}</span></div>
            <small className="muted">اقترحه {e.submittedBy?.name || '—'} · {langName(e.language)}</small>
            {e.examples?.[0] && <small className="muted">مثال: {e.examples[0]}</small>}
            <input className="input" defaultValue={e.standardMeaning} onChange={(ev) => setMeaning((m) => ({ ...m, [e._id]: ev.target.value }))} aria-label="المعنى" />
          </div>
          <div className="entry-actions">
            <button className="btn small primary" onClick={() => review(e._id, 'approved')}><Check /> اعتماد</button>
            <button className="btn small ghost" onClick={() => review(e._id, 'rejected')}><X /> رفض</button>
            <button className="btn icon small ghost" onClick={() => setEditing(e)} aria-label="تعديل"><PencilLine /></button>
          </div>
        </div>
      ))}
      {editing && <EntryEditor entry={editing} groups={groups} staff onClose={() => setEditing(null)}
        onSaved={(en) => { setItems((l) => l.map((x) => (x._id === en._id ? { ...x, ...en } : x))); setEditing(null); }}
        onDeleted={(id) => { setItems((l) => l.filter((x) => x._id !== id)); setEditing(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  إدارة المصطلحات: بحث + تصفية + تعديل + حذف (فردي/جماعي)              */
/* ------------------------------------------------------------------ */
export function EntriesManager({ initial = {} }) {
  const [groups, reloadGroups] = useGroups();
  const [filters, setFilters] = useState({ q: '', dialect: initial.dialect || '', status: initial.status || '' });
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);   // مصطلح أو { _new: true }
  const [select, setSelect] = useState(false);
  const [picked, setPicked] = useState([]);
  const seq = useRef(0);

  const fetchPage = useCallback(async (page, replace) => {
    const my = ++seq.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/dialects/entries', { params: { ...filters, q: filters.q || undefined, dialect: filters.dialect || undefined, status: filters.status || undefined, page, limit: 30 } });
      if (my !== seq.current) return;
      setItems((cur) => (replace ? data.entries : [...cur, ...data.entries]));
      setMeta({ page: data.page, pages: data.pages, total: data.total });
    } catch (e) { if (my === seq.current) setError(errMsg(e)); } finally { if (my === seq.current) setLoading(false); }
  }, [filters]);

  useEffect(() => { const t = setTimeout(() => fetchPage(1, true), 280); return () => clearTimeout(t); }, [fetchPage]);

  const setF = (k) => (v) => setFilters((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const exitSelect = () => { setSelect(false); setPicked([]); };

  const removeOne = async (id) => {
    try { await api.delete(`/dialects/${id}`); setItems((l) => l.filter((x) => x._id !== id)); setMeta((m) => ({ ...m, total: m.total - 1 })); reloadGroups(); }
    catch (e) { setError(errMsg(e)); }
  };
  const removePicked = async () => {
    try {
      await api.post('/dialects/bulk-delete', { ids: picked });
      setItems((l) => l.filter((x) => !picked.includes(x._id)));
      setMeta((m) => ({ ...m, total: m.total - picked.length }));
      exitSelect(); reloadGroups();
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div className="search-box">
          <Search size={18} />
          <input className="input" placeholder="ابحث عن كلمة أو معنى…" value={filters.q} onChange={setF('q')} />
        </div>
        <select className="select" value={filters.dialect} onChange={setF('dialect')} aria-label="المجموعة">
          <option value="">كل الرطانات واللهجات</option>
          <GroupOptions groups={groups} />
        </select>
        <div className="chips scroll">
          {STATUS_FILTERS.map(([v, l]) => <button key={v} className={`chip${filters.status === v ? ' active' : ''}`} onClick={() => setF('status')(v)}>{l}</button>)}
        </div>
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <small className="muted">{meta.total} مصطلح</small>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn small ghost${select ? ' off' : ''}`} onClick={() => (select ? exitSelect() : setSelect(true))}><ListChecks /> {select ? 'إنهاء التحديد' : 'تحديد'}</button>
            <button className="btn small primary" onClick={() => setEditing({ _new: true, dialect: filters.dialect })}><Plus /> إضافة</button>
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {items.length === 0 && !loading ? <Empty icon={BookA}>لا توجد مصطلحات مطابقة</Empty> : items.map((e) => (
          <div key={e._id} className={`entry-row${picked.includes(e._id) ? ' picked' : ''}`}>
            {select && <input type="checkbox" className="pick" checked={picked.includes(e._id)} onChange={() => toggle(e._id)} aria-label="تحديد" />}
            <div className="entry-main" onClick={() => (select ? toggle(e._id) : setEditing(e))}>
              <div className="entry-title">
                <strong>{e.word}</strong>
                <span className="tag">{e.dialect}</span>
                <span className={`badge ${e.status}`}>{STATUS_LABEL[e.status]}</span>
              </div>
              <span>{e.standardMeaning}</span>
              {e.variants?.length > 0 && <small className="muted">وتُكتب أيضاً: {e.variants.join('، ')}</small>}
              {e.submittedBy?.name && <small className="muted">أضافه {e.submittedBy.name}</small>}
            </div>
            {!select && (
              <div className="entry-actions">
                <button className="btn icon small ghost" onClick={() => setEditing(e)} aria-label="تعديل"><PencilLine /></button>
                <ConfirmButton className="btn icon small ghost danger" confirmLabel="تأكيد" ariaLabel="حذف" onConfirm={() => removeOne(e._id)}><Trash2 /></ConfirmButton>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="empty"><LoaderCircle className="spin" /></div>}
        {!loading && meta.page < meta.pages && <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => fetchPage(meta.page + 1, false)}><ChevronDown /> تحميل المزيد</button>}
      </div>

      {select && picked.length > 0 && (
        <div className="bulkbar">
          <span>{picked.length} محدد</span>
          <ConfirmButton className="btn small danger" confirmLabel={`تأكيد حذف ${picked.length}`} onConfirm={removePicked}><Trash2 /> حذف المحدد</ConfirmButton>
          <button className="btn small ghost" onClick={() => setPicked([])}>إلغاء</button>
        </div>
      )}

      {editing && !editing._new && <EntryEditor entry={editing} groups={groups} staff onClose={() => setEditing(null)}
        onSaved={(en) => { setItems((l) => l.map((x) => (x._id === en._id ? { ...x, ...en } : x))); setEditing(null); reloadGroups(); }}
        onDeleted={(id) => { setItems((l) => l.filter((x) => x._id !== id)); setEditing(null); reloadGroups(); }} />}
      {editing?._new && <NewEntry groups={groups} preset={editing.dialect} onClose={() => setEditing(null)} onDone={() => { setEditing(null); fetchPage(1, true); reloadGroups(); }} />}
    </div>
  );
}

function NewEntry({ groups, preset, onClose, onDone }) {
  const [f, setF] = useState({ word: '', standardMeaning: '', dialect: preset || '', variants: '', example: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/dialects', { word: f.word, dialect: f.dialect, standardMeaning: f.standardMeaning,
        variants: f.variants.split(/[,،]/).map((x) => x.trim()).filter(Boolean), examples: f.example ? [f.example] : [] });
      onDone();
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ fontSize: '1.2rem' }}>إضافة مصطلح</h2>
        <select className="select" value={f.dialect} onChange={set('dialect')} required aria-label="المجموعة"><option value="" disabled>اختر الرطانة / اللهجة…</option><GroupOptions groups={groups.filter((g) => g.active !== false)} /></select>
        <input className="input" placeholder="الكلمة أو العبارة" value={f.word} onChange={set('word')} required />
        <input className="input" placeholder="المعنى بالعربية" value={f.standardMeaning} onChange={set('standardMeaning')} required />
        <input className="input" placeholder="تهجئات أخرى (اختياري، تفصلها فاصلة)" value={f.variants} onChange={set('variants')} />
        <input className="input" placeholder="مثال (اختياري)" value={f.example} onChange={set('example')} />
        {error && <div className="alert error">{error}</div>}
        <div className="sheet-actions"><button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة</button><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button></div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  قاموس الرطانات: المجموعات (إضافة / تعديل / تعطيل / حذف) + استيراد      */
/* ------------------------------------------------------------------ */
export function Groups({ me, onOpenEntries }) {
  const [groups, load] = useGroups();
  const [f, setF] = useState({ name: '', nameEn: '', code: '', category: 'tribal', region: '' });
  const [bulk, setBulk] = useState({ dialect: '', text: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const addGroup = async (e) => {
    e.preventDefault(); setError('');
    try { await api.post('/dialects/groups', f); setF({ name: '', nameEn: '', code: '', category: 'tribal', region: '' }); load(); } catch (err) { setError(errMsg(err)); }
  };
  const toggle = async (g) => { try { await api.patch(`/dialects/groups/${g._id}`, { active: g.active === false }); load(); } catch (e) { setError(errMsg(e)); } };
  const doBulk = async () => {
    setBusy(true); setError(''); setResult(null);
    try { const { data } = await api.post('/dialects/bulk', bulk); setResult(data); setBulk((b) => ({ ...b, text: '' })); load(); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>الرطانات واللهجات ({groups.length})</h2>
        {groups.map((g) => (
          <div key={g.name} className={`entry-row${g.active === false ? ' dim' : ''}`}>
            <div className="entry-main">
              <div className="entry-title"><strong>{g.name}</strong>{g.active === false && <span className="badge rejected">معطّلة</span>}</div>
              <small className="muted">{CAT[g.category]}{g.region ? ` · ${g.region}` : ''} · {g.count} مصطلح</small>
            </div>
            <div className="entry-actions">
              <button className="btn small ghost" onClick={() => onOpenEntries(g.name)}><Layers /> المصطلحات</button>
              {g._id && <button className="btn icon small ghost" onClick={() => setEditing(g)} aria-label="تعديل"><PencilLine /></button>}
              {g._id && <button className="btn small ghost" onClick={() => toggle(g)}>{g.active === false ? 'تفعيل' : 'تعطيل'}</button>}
              {g._id && <button className="btn icon small ghost danger" onClick={() => setDeleting(g)} aria-label="حذف"><Trash2 /></button>}
            </div>
          </div>
        ))}
      </div>

      <form className="card stack" onSubmit={addGroup}>
        <h2 style={{ fontSize: '1.1rem' }}>إضافة رطانة / لهجة جديدة</h2>
        <div className="grid cols-2">
          <input className="input" placeholder="الاسم بالعربية (مثال: القمر)" value={f.name} onChange={set('name')} required />
          <input className="input ltr" placeholder="الاسم بالإنجليزية (اختياري)" value={f.nameEn} onChange={set('nameEn')} />
          <select className="select" value={f.category} onChange={set('category')}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="input" placeholder="المنطقة (اختياري)" value={f.region} onChange={set('region')} />
        </div>
        <button className="btn" style={{ alignSelf: 'flex-start' }}><Plus /> إضافة</button>
      </form>

      <div className="card stack">
        <h2 style={{ fontSize: '1.1rem' }}>استيراد جماعي للمفردات</h2>
        <p className="muted" style={{ fontSize: '.88rem' }}>الصق مفردات، كل سطر: <b>الكلمة | المعنى بالعربية | تهجئات أخرى (اختياري)</b>. تُعتمد مباشرة، ويمكنك لاحقاً تعديلها أو حذفها من «المصطلحات».</p>
        <select className="select" value={bulk.dialect} onChange={(e) => setBulk((b) => ({ ...b, dialect: e.target.value }))}>
          <option value="">اختر المجموعة…</option>
          {groups.filter((g) => g.active !== false).map((g) => <option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
        </select>
        <textarea className="textarea" style={{ minHeight: 140 }} placeholder={'كلمة | معناها\nكلمة أخرى | معناها | تهجئة بديلة'} value={bulk.text} onChange={(e) => setBulk((b) => ({ ...b, text: e.target.value }))} />
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !bulk.dialect || !bulk.text.trim()} onClick={doBulk}>{busy ? <LoaderCircle className="spin" /> : <Plus />} استيراد</button>
        {result && <div className="alert info">أُضيف {result.added} · مكرر {result.skipped}{result.errors?.length ? ` · أخطاء: ${result.errors.join('، ')}` : ''}</div>}
      </div>

      {editing && <GroupEditor group={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && <GroupDelete group={deleting} isAdmin={me?.role === 'admin'} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
    </div>
  );
}

function GroupEditor({ group, onClose, onSaved }) {
  const [f, setF] = useState({ name: group.name || '', nameEn: group.nameEn || '', code: group.code || '', category: group.category || 'tribal', region: group.region || '', description: group.description || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const renamed = f.name.trim() && f.name.trim() !== group.name;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.patch(`/dialects/groups/${group._id}`, f); onSaved(); } catch (err) { setError(errMsg(err)); setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 style={{ fontSize: '1.2rem' }}>تعديل «{group.name}»</h2>
        <div className="field"><label>الاسم بالعربية</label><input className="input" value={f.name} onChange={set('name')} required /></div>
        {renamed && group.count > 0 && <div className="alert info">سيُنقل ({group.count}) مصطلح تلقائياً إلى الاسم الجديد.</div>}
        <div className="field"><label>الاسم بالإنجليزية</label><input className="input ltr" value={f.nameEn} onChange={set('nameEn')} /></div>
        <div className="field"><label>التصنيف</label><select className="select" value={f.category} onChange={set('category')}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="grid cols-2">
          <div className="field"><label>رمز اللغة (اختياري)</label><input className="input ltr" value={f.code} onChange={set('code')} /></div>
          <div className="field"><label>المنطقة</label><input className="input" value={f.region} onChange={set('region')} /></div>
        </div>
        <div className="field"><label>وصف</label><textarea className="textarea" style={{ minHeight: 70 }} value={f.description} onChange={set('description')} /></div>
        {error && <div className="alert error">{error}</div>}
        <div className="sheet-actions"><button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : 'حفظ'}</button><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button></div>
      </form>
    </div>
  );
}

function GroupDelete({ group, isAdmin, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (cascade) => {
    setBusy(true); setError('');
    try { await api.delete(`/dialects/groups/${group._id}`, { params: cascade ? { cascade: 1 } : {} }); onDone(); }
    catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await api.patch(`/dialects/groups/${group._id}`, { active: false }); onDone(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.2rem' }}>حذف «{group.name}»</h2>
        {group.count > 0
          ? <p>فيها <b>{group.count}</b> مصطلح. الأسلم أن تُعطَّلها فتختفي من التطبيق وتبقى بياناتها، أو احذفها نهائياً مع كل مصطلحاتها{isAdmin ? '' : ' (للمدير فقط)'}.</p>
          : <p>المجموعة فارغة. هل تريد حذفها نهائياً؟</p>}
        {error && <div className="alert error">{error}</div>}
        <div className="sheet-actions">
          {group.count > 0 && <button className="btn" disabled={busy} onClick={disable}>تعطيل بدلاً من الحذف</button>}
          {group.count === 0 && <ConfirmButton className="btn danger" confirmLabel="تأكيد الحذف النهائي" onConfirm={() => run(false)} disabled={busy}><Trash2 /> حذف</ConfirmButton>}
          {group.count > 0 && isAdmin && <ConfirmButton className="btn ghost danger" confirmLabel={`تأكيد حذف ${group.count} مصطلح`} onConfirm={() => run(true)} disabled={busy}><Trash2 /> حذف مع المصطلحات</ConfirmButton>}
          <button className="btn ghost" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
