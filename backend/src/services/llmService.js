import { AppError } from '../middlewares/errorHandler.js';

export const llmAvailable = () => !!process.env.GROQ_API_KEY;

export async function chatJSON({ system, user, maxTokens = 700, model, temperature = 0.2 }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile',
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    console.error('Groq LLM error:', res.status, await res.text().catch(() => ''));
    throw new AppError('فشل مزود الذكاء الاصطناعي', 502);
  }
  const content = (await res.json()).choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); } catch { return {}; }
}
