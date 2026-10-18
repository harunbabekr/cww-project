// تطبيع أرقام الهاتف: يقبل الصيغ المحلية (0912345678) والدولية (+249912345678 / 00249...) والأرقام الهندية (٠٩١٢...)
const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

export const toAsciiDigits = (s = '') =>
  String(s).replace(/[٠-٩۰-۹]/g, (d) => String(AR.indexOf(d) >= 0 ? AR.indexOf(d) : FA.indexOf(d)));

export const looksLikePhone = (q) => /^\+?[\d\s()\-.٠-٩۰-۹]{6,22}$/.test(String(q || '').trim());

/** يعيد الرقم بصيغة E.164 (+249912345678) أو null إن كان غير صالح. defaultCC = رمز دولة المستخدم الحالي */
export function normalizePhone(input, defaultCC = '+249') {
  const raw = toAsciiDigits(input).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  const cc = String(defaultCC || '+249').replace(/\D/g, '');

  let full;
  if (hasPlus) full = d;
  else if (d.startsWith('00')) full = d.slice(2);
  else if (d.startsWith('0')) full = cc + d.replace(/^0+/, '');
  else if (d.startsWith(cc) && d.length >= cc.length + 8) full = d; // 249912345678
  else full = cc + d; // 912345678
  if (full.length < 8 || full.length > 15) return null;
  return `+${full}`;
}
