import { useState } from 'react';
import { LoaderCircle, Save, Trash2 } from 'lucide-react';
import api, { errMsg } from '../services/api';
import { GroupOptions, STATUS_LABEL } from '../lib/dialectUi';
import { ConfirmButton } from './ui';

/**
 * نافذة تعديل/حذف مصطلح (كلمة في رطانة أو لهجة).
 * staff: يظهر تغيير المجموعة والحالة. صاحب الاقتراح (غير المشرف) يعدّل كلمته قبل الاعتماد فقط.
 */
export default function EntryEditor({ entry, groups, staff, onClose, onSaved, onDeleted }) {
  const [f, setF] = useState({
    word: entry.word || '',
    standardMeaning: entry.standardMeaning || '',
    variants: (entry.variants || []).join('، '),
    examples: (entry.examples || []).join('\n'),
    dialect: entry.dialect || '',
    status: entry.status || 'approved',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { word: f.word, standardMeaning: f.standardMeaning, variants: f.variants, examples: f.examples };
      if (staff) Object.assign(body, { dialect: f.dialect, status: f.status });
      const { data } = await api.patch(`/dialects/${entry._id}`, body);
      onSaved({ ...entry, ...data.entry });
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError('');
    try { await api.delete(`/dialects/${entry._id}`); onDeleted(entry._id); }
    catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 style={{ fontSize: '1.2rem' }}>تعديل المصطلح</h2>
        {staff && (
          <div className="field">
            <label htmlFor="ee-d">اللغة / اللهجة</label>
            <select id="ee-d" className="select" value={f.dialect} onChange={set('dialect')}>
              {!groups.some((g) => g.name === f.dialect) && <option value={f.dialect}>{f.dialect}</option>}
              <GroupOptions groups={groups} />
            </select>
          </div>
        )}
        <div className="field"><label htmlFor="ee-w">الكلمة أو العبارة</label><input id="ee-w" className="input" value={f.word} onChange={set('word')} required /></div>
        <div className="field"><label htmlFor="ee-m">المعنى بالعربية</label><input id="ee-m" className="input" value={f.standardMeaning} onChange={set('standardMeaning')} required /></div>
        <div className="field"><label htmlFor="ee-v">تهجئات أخرى (تفصلها فاصلة)</label><input id="ee-v" className="input" value={f.variants} onChange={set('variants')} /></div>
        <div className="field"><label htmlFor="ee-x">أمثلة (مثال في كل سطر)</label><textarea id="ee-x" className="textarea" style={{ minHeight: 70 }} value={f.examples} onChange={set('examples')} /></div>
        {staff && (
          <div className="field">
            <label htmlFor="ee-s">الحالة</label>
            <select id="ee-s" className="select" value={f.status} onChange={set('status')}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
        {!staff && <p className="muted" style={{ fontSize: '0.85rem' }}>بعد التعديل يعود اقتراحك إلى المراجعة.</p>}
        {error && <div className="alert error">{error}</div>}
        <div className="sheet-actions">
          <button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />} حفظ</button>
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <ConfirmButton onConfirm={remove} disabled={busy} className="btn ghost danger"><Trash2 /> حذف</ConfirmButton>
        </div>
      </form>
    </div>
  );
}
