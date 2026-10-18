import DialectGroup from '../models/DialectGroup.js';
import DialectDictionary from '../models/DialectDictionary.js';
import translationService from './translationService.js';
import { chatJSON, llmAvailable } from './llmService.js';
import { groupIndex, matchText, substitute } from './glossaryService.js';
import { AppError } from '../middlewares/errorHandler.js';
import { byCode, isSupportedLanguage } from '../utils/languages.js';

const nameOf = (c) => byCode(c)?.native || c;

/**
 * ترجمة رطانة/لهجة إلى العربية (أو لغة أخرى).
 *
 * 1) لغة لها ترجمة آلية (مثل الهوسا): ترجمة آلية/لغوية + مصطلحات القاموس كتلميح.
 * 2) رطانة سودانية بلا ترجمة آلية (فلاتة، برقو، تامة...): لا يوجد مترجم آلي لها في العالم،
 *    فنعتمد على القاموس المعتمد فقط، ونُرجع الكلمات غير المعروفة ليضيف المستخدمون معناها.
 */
export async function translateDialect({ text, dialect, to = 'ar', style = 'colloquial', toDialect }) {
  const clean = String(text || '').trim();
  if (!clean) throw new AppError('النص مطلوب', 400);
  if (clean.length > 1500) throw new AppError('النص طويل (الحد 1500 حرف)', 400);
  if (!isSupportedLanguage(to) || to === 'auto') throw new AppError('لغة الهدف غير صالحة', 400);

  const group = await DialectGroup.findOne({ name: dialect }).lean();
  const known = group || (await DialectDictionary.exists({ dialect })) || null;
  if (!known) throw new AppError('اللهجة غير موجودة', 404);

  const index = await groupIndex(dialect);
  const m = matchText(clean, index);
  const usedTerms = m.hits.map((e) => e.word);
  const base = { usedTerms, unknown: m.unknown, coverage: Math.round(m.coverage * 100), entries: index.size };
  const mt = group?.mtLanguage && isSupportedLanguage(group.mtLanguage) ? group.mtLanguage : null;

  // (0) لهجة عربية إلى العربية: نوحّدها إلى فصحى واضحة (الترجمة الآلية ستعيد النص كما هو لأن اللغتين واحدة)
  if (mt && mt === to) {
    const sub = substitute(clean, index);
    if (llmAvailable()) {
      const glossary = [...index.single.values()].slice(0, 120).map((e) => `${e.word} => ${e.standardMeaning}`).join('\n');
      const out = await chatJSON({
        temperature: 0, maxTokens: 500, user: clean,
        system: `Rewrite the user's "${dialect}" Arabic dialect text as clear, natural Modern Standard Arabic, keeping the exact meaning and tone. Use this glossary as authoritative:\n${glossary || '(none)'}\nReturn ONLY JSON: {"translation":"..."}`,
      });
      if (out.translation) return { ...base, standard: sub, translation: out.translation, engine: 'ai+glossary', mode: 'normalize', unknown: [] };
    }
    return { ...base, standard: sub, translation: sub, engine: 'dictionary', mode: 'normalize', unknown: m.unknown };
  }

  // (1) لغة لها ترجمة آلية
  if (mt) {
    const hints = m.hits.map((e) => `${e.word} => ${e.standardMeaning}`);
    const r = await translationService.translateText(clean, mt, to, { style, hints });
    return { ...base, standard: clean, translation: r.translated, engine: r.engine, mode: 'mt', unknown: [] };
  }

  // (2) رطانة بلا مترجم آلي: القاموس فقط
  if (!index.size) {
    return { ...base, standard: clean, translation: '', engine: 'none', mode: 'glossary', warning: `لا توجد مصطلحات معتمدة لـ «${dialect}» بعد. ساهم بإضافة كلمات ومعانيها ليتمكن التطبيق من الترجمة.` };
  }

  const lowCoverage = base.coverage < 50;
  const warning = lowCoverage ? `تغطية القاموس ${base.coverage}% فقط، فالترجمة تقريبية. الكلمات غير المعروفة بين أقواس.` : undefined;
  const toLabel = to === 'ar' ? (style === 'colloquial' ? 'Sudanese colloquial Arabic' : 'clear Modern Standard Arabic') : nameOf(to);

  if (llmAvailable()) {
    const dst = toDialect ? await groupIndex(toDialect) : null;
    const system = [
      `You help translate the Sudanese local language/speech "${dialect}"${group?.code ? ` (code ${group.code})` : ''} into ${toLabel}.`,
      'There is NO machine-translation system for this language. Rely ONLY on the community glossary below; you know little about this language, so do NOT guess.',
      'Rules: (1) use glossary meanings for matched words/phrases; (2) any word NOT covered by the glossary must stay unchanged inside square brackets like [word]; (3) combine the meanings into one natural sentence in the target language with sensible word order; (4) never invent meanings.',
      `Glossary (word => meaning):\n${[...new Map([...index.single, ...index.phrases.map((p) => [p.key, p.e])]).values()].slice(0, 120).map((e) => `${e.word} => ${e.standardMeaning}`).join('\n')}`,
      dst?.size ? `Target-dialect vocabulary (meaning <= word) to phrase the output in "${toDialect}":\n${[...dst.single.values()].slice(0, 80).map((e) => `${e.standardMeaning} <= ${e.word}`).join('\n')}` : '',
      'Respond ONLY with JSON: {"standard":"literal meaning-by-meaning rendering","translation":"final natural sentence","unknown":["words not in glossary"]}',
    ].filter(Boolean).join('\n\n');

    const out = await chatJSON({ system, user: clean, temperature: 0, maxTokens: 600 });
    if (out.translation) {
      return { ...base, standard: out.standard || clean, translation: out.translation, engine: 'ai+glossary', mode: 'glossary', unknown: m.unknown, warning };
    }
  }

  // احتياطي بلا ذكاء اصطناعي: استبدال الكلمات المعروفة وإبقاء غيرها بين أقواس
  const known2 = new Set(m.hits.flatMap((e) => [e.word, ...(e.variants || [])]));
  const sub = substitute(clean, index);
  const translation = sub.replace(/[\p{L}\p{N}_'’]+/gu, (w) => (m.unknown.includes(w) && !known2.has(w) ? `[${w}]` : w));
  return { ...base, standard: translation, translation, engine: 'dictionary', mode: 'glossary', warning };
}
