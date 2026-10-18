// فحص أن الناتج مكتوب بخط اللغة المطلوبة (يكشف ترجمة فاشلة تعود بلغة خاطئة)
const ARABIC = /[\u0600-\u06FF]/g;
const RANGES = {
  ar: ARABIC, fa: ARABIC, ur: ARABIC,
  he: /[\u0590-\u05FF]/g, hi: /[\u0900-\u097F]/g, bn: /[\u0980-\u09FF]/g,
  zh: /[\u4E00-\u9FFF]/g, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/g, ko: /[\uAC00-\uD7AF]/g,
  th: /[\u0E00-\u0E7F]/g, ru: /[\u0400-\u04FF]/g, uk: /[\u0400-\u04FF]/g,
};
const LATIN_LANGS = new Set(['en', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'id', 'ms', 'nl', 'pl', 'vi', 'sw', 'ha']);
const LATIN = /[A-Za-z\u00C0-\u024F\u0253\u0257\u0199\u01B4]/g;

export function scriptOk(text, lang) {
  const letters = String(text).match(/\p{L}/gu) || [];
  if (letters.length < 4) return true;
  const re = RANGES[lang] || (LATIN_LANGS.has(lang) ? LATIN : null);
  if (!re) return true;
  return (String(text).match(re) || []).length / letters.length >= 0.5;
}

export const hasArabic = (t) => /[\u0600-\u06FF]/.test(t);
