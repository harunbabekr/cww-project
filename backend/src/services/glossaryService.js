import DialectDictionary from '../models/DialectDictionary.js';
import { normalizeToken, normalizePhrase, tokenize } from '../utils/arabic.js';

const TTL = 60 * 1000;
const cache = new Map();
const SUDANESE_GROUP = () => process.env.SUDANESE_GROUP || 'السودانية';

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await loader();
  cache.set(key, { t: Date.now(), v });
  return v;
}
export const clearGlossaryCache = () => cache.clear();

const SELECT = 'word norm variantNorms standardMeaning examples dialect';

function buildIndex(entries) {
  const single = new Map();
  const phrases = [];
  for (const e of entries) {
    for (const k of [e.norm, ...(e.variantNorms || [])].filter(Boolean)) {
      if (k.includes(' ')) phrases.push({ key: k, e }); else single.set(k, e);
    }
  }
  phrases.sort((a, b) => b.key.length - a.key.length); // الأطول أولاً
  return { single, phrases, size: entries.length };
}

export const groupIndex = (dialect) =>
  cached(`g:${dialect}`, async () => buildIndex(await DialectDictionary.find({ dialect, status: 'approved' }).select(SELECT).limit(5000).lean()));

// كل المصطلحات المعتمدة للغة العربية (للتلميح للمترجم بمعاني الكلمات العامية)
export const arabicIndex = () =>
  cached('ar', async () => buildIndex(await DialectDictionary.find({ language: 'ar', status: 'approved' }).select(SELECT).limit(6000).lean()));

/**
 * يطابق النص بالقاموس (عبارات ثم كلمات مفردة).
 * يعيد: hits (المصطلحات المطابقة)، unknown (كلمات غير موجودة)، coverage (نسبة التغطية 0..1)
 */
export function matchText(text, index) {
  const raw = tokenize(text);
  const norm = raw.map(normalizeToken);
  const covered = new Array(raw.length).fill(false);
  const hits = new Map();

  for (const { key, e } of index.phrases) {
    const parts = key.split(' ');
    for (let i = 0; i + parts.length <= norm.length; i++) {
      if (parts.every((p, j) => norm[i + j] === p) && !covered.slice(i, i + parts.length).some(Boolean)) {
        for (let j = 0; j < parts.length; j++) covered[i + j] = true;
        hits.set(e.word, e);
      }
    }
  }
  norm.forEach((t, i) => {
    if (covered[i]) return;
    const e = lookup(index, t)?.e;
    if (e) { covered[i] = true; hits.set(e.word, e); }
  });

  const unknown = [...new Set(raw.filter((w, i) => !covered[i] && w.length > 1 && !/^\d+$/.test(w)))];
  const words = raw.filter((w) => !/^\d+$/.test(w)).length || 1;
  return { hits: [...hits.values()], unknown, coverage: covered.filter(Boolean).length / words, tokens: raw.length };
}

// بحث عن كلمة مفردة، مع تجريد «ال» التعريف (الزول ← زول)
function lookup(index, t) {
  const e = index.single.get(t);
  if (e) return { e, article: false };
  if (t.length > 3 && t.startsWith('ال')) {
    const e2 = index.single.get(t.slice(2));
    if (e2) return { e: e2, article: true };
  }
  return null;
}

/** استبدال الكلمات العامية بمعانيها قبل الترجمة الآلية (للكلمات المفردة فقط) */
export function substitute(text, index) {
  return String(text).replace(/[\p{L}\p{N}_'’]+/gu, (w) => {
    const r = lookup(index, normalizeToken(w));
    if (!r) return w;
    const meaning = r.e.standardMeaning.split(' / ')[0].trim(); // أول معنى فقط
    return r.article && !meaning.includes(' ') ? `ال${meaning}` : meaning;
  });
}

export async function sudaneseVocab(limit = 40) {
  const idx = await groupIndex(SUDANESE_GROUP());
  return [...idx.single.values()].slice(0, limit);
}

// نص تلميح لـ Whisper يميل بالتعرف نحو مفردات اللهجة السودانية
export async function biasPrompt(lang) {
  if (lang !== 'ar') return undefined;
  try {
    const words = (await sudaneseVocab(24)).map((e) => e.word);
    return words.length ? `كلام باللهجة السودانية: ${words.join('، ')}` : undefined;
  } catch { return undefined; }
}

/** يحسب norm للمصطلحات القديمة التي أُنشئت قبل إضافة هذا الحقل */
export async function backfillNorm() {
  const old = await DialectDictionary.find({ $or: [{ norm: { $exists: false } }, { norm: '' }] }).limit(5000);
  for (const d of old) { d.norm = normalizePhrase(d.word); await d.save().catch(() => {}); }
  return old.length;
}
