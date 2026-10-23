export const CATEGORY_LABELS = {
  tribal: 'لغات ورطانات السودان',
  sudanese_arabic: 'اللهجات العربية السودانية',
  other_arabic: 'لهجات عربية أخرى',
};
const ORDER = ['tribal', 'sudanese_arabic', 'other_arabic'];

/** خيارات <select> مجمّعة حسب التصنيف */
export function GroupOptions({ groups }) {
  return ORDER.map((cat) => {
    const list = groups.filter((g) => g.category === cat);
    return list.length ? (
      <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
        {list.map((g) => <option key={g.name} value={g.name}>{g.name}{g.count ? ` (${g.count})` : ''}</option>)}
      </optgroup>
    ) : null;
  });
}

export const STATUS_LABEL = { approved: 'معتمد', pending: 'بانتظار المراجعة', rejected: 'مرفوض' };
