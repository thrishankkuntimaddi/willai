// LLM providers: Anthropic (when configured) → Gemini (free tier) → Ollama (local). Output is coerced into one JSON shape.
import Anthropic from '@anthropic-ai/sdk';

export { Anthropic };
const MODEL = 'claude-opus-5-5';
const anthropic = new Anthropic();
const hasAnthropic = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

export function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);           // models sometimes wrap JSON in prose or fences
  if (m) return JSON.parse(m[0]);
  throw Object.assign(new Error('The AI returned an unreadable answer. Please try again.'), { status: 502 });
}

async function viaAnthropic(system, user) {
  const res = await anthropic.beta.messages.create({
    model: MODEL, max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system, messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('The model declined this request.'), { status: 422 });
  if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('The analysis was cut off; please try again.'), { status: 502 });
  return { json: validate(parseJSON(res.content.filter(b => b.type === 'text').map(b => b.text).join(''))), model: res.model };
}

const GEMINI_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
async function viaGemini(system, user) {
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACKS])];
  const sys = `${system}\n\nReturn ONLY one JSON object (no markdown) that matches this JSON Schema exactly:\n${JSON.stringify(SCHEMA)}`;
  let lastErr = '';
  for (const model of models) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16000, temperature: 0.4 },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = `${model}: ${r.status} ${d.error?.message || ''}`; console.warn('[gemini]', lastErr.slice(0, 160)); if ([404, 429, 500, 503].includes(r.status)) continue; break; }
      const cand = d.candidates?.[0];
      const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (!text) { lastErr = `${model}: empty (${cand?.finishReason || d.promptFeedback?.blockReason || 'unknown'})`; console.warn('[gemini]', lastErr); continue; }
      return { json: validate(parseJSON(text)), model };
    } catch (e) {
      lastErr = `${model}: ${e.name === 'AbortError' ? 'timeout' : e.message}`; console.warn('[gemini]', lastErr);
      if (e.status) throw e;
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(new Error(/429/.test(lastErr) ? 'The free AI quota is used up for now. Please try again later.' : 'The AI service is busy right now. Please try again in a minute.'), { status: 503 });
}

// coerce model output into the shape the UI expects (models without strict schemas drift)
export function validate(o) {
  const int = (v, d = 0) => Math.max(0, Math.min(100, Math.round(Number(v)) || d));
  const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, 600);
  const arr = v => (Array.isArray(v) ? v : []);
  const cat = v => (['automate', 'augment', 'human'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : 'augment');
  const out = {
    exposure_score: int(o.exposure_score), exposure_2030: o.exposure_2030 == null ? null : int(o.exposure_2030),
    verdict: str(o.verdict), market_read: str(o.market_read),
    evidence_quality: ['strong', 'partial', 'thin'].includes(o.evidence_quality) ? o.evidence_quality : 'partial',
    tasks: arr(o.tasks).slice(0, 10).map(t => ({ task: str(t.task), category: cat(t.category), exposure: int(t.exposure), why: str(t.why) })).filter(t => t.task),
    human_edge: arr(o.human_edge).map(str).filter(Boolean).slice(0, 8),
    future_roles: arr(o.future_roles).slice(0, 6).map(r => ({ title: str(r.title), fit: int(r.fit), why: str(r.why), gap: arr(r.gap).map(str).slice(0, 8), evidence_ids: arr(r.evidence_ids).map(str) })).filter(r => r.title),
    skills_to_learn: arr(o.skills_to_learn).slice(0, 10).map(k => (typeof k === 'string' ? { skill: k, reason: '' } : { skill: str(k.skill), reason: str(k.reason) })).filter(k => k.skill),
    plan: arr(o.plan).slice(0, 3).map((p, i) => ({ phase: str(p.phase), days: str(p.days) || ['Days 1-30', 'Days 31-60', 'Days 61-90'][i], steps: arr(p.steps).map(str).filter(Boolean).slice(0, 7) })),
  };
  if (!out.tasks.length || !out.plan.length) throw Object.assign(new Error('The AI returned an incomplete answer. Please try again.'), { status: 502 });
  return out;
}

async function viaOllama(system, user) {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL, stream: false, format: SCHEMA,
      options: { num_ctx: 16384, temperature: 0.3 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  }).catch(() => null);
  if (!r) throw Object.assign(new Error('No AI provider is available. Start Ollama (ollama serve) or set GEMINI_API_KEY.'), { status: 503 });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[ollama]', r.status, d.error);
    throw Object.assign(new Error(/not found/i.test(d.error || '') ? `The local model is not downloaded yet. Run: ollama pull ${OLLAMA_MODEL}` : 'The local AI model failed.'), { status: 503 });
  }
  return { json: validate(parseJSON(d.message?.content || '')), model: `${OLLAMA_MODEL} (local)` };
}

export function provider() { return hasAnthropic() ? 'anthropic' : process.env.GEMINI_API_KEY ? 'gemini' : 'ollama'; }
export const llm = (system, user) => ({ anthropic: viaAnthropic, gemini: viaGemini, ollama: viaOllama })[provider()](system, user);

export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['exposure_score', 'verdict', 'tasks', 'human_edge', 'future_roles', 'skills_to_learn', 'plan', 'market_read', 'evidence_quality'],
  properties: {
    exposure_score: { type: 'integer', description: '0-100: share of this person\'s current work that AI can do or substantially speed up today' },
    exposure_2030: { type: 'integer' },
    verdict: { type: 'string' },
    evidence_quality: { type: 'string', enum: ['strong', 'partial', 'thin'] },
    market_read: { type: 'string' },
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['task', 'category', 'exposure', 'why'],
      properties: { task: { type: 'string' }, category: { type: 'string', enum: ['automate', 'augment', 'human'] }, exposure: { type: 'integer' }, why: { type: 'string' } } } },
    human_edge: { type: 'array', items: { type: 'string' } },
    future_roles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'fit', 'why', 'gap', 'evidence_ids'],
      properties: { title: { type: 'string' }, fit: { type: 'integer' }, why: { type: 'string' }, gap: { type: 'array', items: { type: 'string' } }, evidence_ids: { type: 'array', items: { type: 'string' } } } } },
    skills_to_learn: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['skill', 'reason'],
      properties: { skill: { type: 'string' }, reason: { type: 'string' } } } },
    plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['phase', 'days', 'steps'],
      properties: { phase: { type: 'string' }, days: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } } } },
  },
};
