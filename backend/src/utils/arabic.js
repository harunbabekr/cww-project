// تطبيع النصوص للمطابقة: يوحّد أشكال الألف والياء والتاء المربوطة، ويحذف التشكيل والتطويل،
// ويحوّل حروف الهوسا الخاصة (ɓ ɗ ƙ ƴ) إلى مقابلاتها اللاتينية.
const TASHKEEL = /[\u064B-\u065F\u0670\u0640]/g;
const HAUSA = { 'ɓ': 'b', 'ɗ': 'd', 'ƙ': 'k', 'ƴ': 'y' };

export const tokenize = (s = '') => String(s).match(/[\p{L}\p{N}_'’]+/gu) || [];

export const normalizeToken = (s = '') =>
  String(s).toLowerCase().normalize('NFKC')
    .replace(/[ɓɗƙƴ]/g, (c) => HAUSA[c])
    .replace(TASHKEEL, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/['’`ʼ]/g, '')
    .trim();

export const normalizePhrase = (s = '') => tokenize(s).map(normalizeToken).filter(Boolean).join(' ');
