import { chatJSON, llmAvailable } from './llmService.js';
import translationService from './translationService.js';
import { byCode } from '../utils/languages.js';
import { tokenize, normalizeToken } from '../utils/arabic.js';

const nm = (c) => byCode(c)?.native || c;

/** تقييم جودة الترجمة: نموذج لغوي يراجع المعنى، وإلا مقارنة بالترجمة العكسية */
export async function verifyTranslation({ text, from, to, translated }) {
  if (llmAvailable()) {
    const out = await chatJSON({
      temperature: 0,
      maxTokens: 500,
      system:
        'You are a strict bilingual translation QA reviewer. Compare the SOURCE and the TRANSLATION. ' +
        'Score 0-100 how faithfully the translation preserves the meaning, tone and natural phrasing. ' +
        'Penalise omissions, wrong meanings, literal/unnatural wording. Reply ONLY JSON: ' +
        '{"score":number,"issues":["short issue in Arabic"],"suggestion":"an improved translation in the target language, or empty string if already good"}',
      user: JSON.stringify({ source_language: nm(from), target_language: nm(to), SOURCE: text, TRANSLATION: translated }),
    });
    const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
    return { score, issues: Array.isArray(out.issues) ? out.issues.slice(0, 4) : [], suggestion: String(out.suggestion || '').trim(), method: 'ai' };
  }
  const back = await translationService.translateText(translated, to, from);
  const a = new Set(tokenize(text).map(normalizeToken));
  const b = new Set(tokenize(back.translated).map(normalizeToken));
  const inter = [...a].filter((x) => b.has(x)).length;
  const score = Math.round((inter / Math.max(1, new Set([...a, ...b]).size)) * 100);
  return { score, issues: [], suggestion: '', backTranslation: back.translated, method: 'back-translation' };
}
