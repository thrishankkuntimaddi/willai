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
  return { json: parseJSON(res.content.filter(b => b.type === 'text').map(b => b.text).join('')), model: res.model };
}

const GEMINI_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
async function viaGemini(system, user) {
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACKS])];
  const sys = `${system}\n\nReturn ONLY one JSON object (no markdown) that matches this JSON Schema exactly:\n${JSON.stringify(SCHEMA)}`;
  let lastErr = '';
  const deadline = Date.now() + 150000;                     // never keep someone waiting more than ~2.5 minutes
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 15000) break;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), Math.min(70000, left));
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
      return { json: parseJSON(text), model };
    } catch (e) {
      lastErr = `${model}: ${e.name === 'AbortError' ? 'timeout' : e.message}`; console.warn('[gemini]', lastErr);
      if (e.status) throw e;
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(new Error(/429/.test(lastErr) ? 'The free AI quota is used up for now. Please try again later.' : 'The AI service is busy right now. Please try again in a minute.'), { status: 503 });
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
  return { json: parseJSON(d.message?.content || ''), model: `${OLLAMA_MODEL} (local)` };
}

export function provider() { return hasAnthropic() ? 'anthropic' : process.env.GEMINI_API_KEY ? 'gemini' : 'ollama'; }
export const llm = (system, user) => ({ anthropic: viaAnthropic, gemini: viaGemini, ollama: viaOllama })[provider()](system, user);

const obj = (props, req = Object.keys(props)) => ({ type: 'object', additionalProperties: false, required: req, properties: props });
const S = { type: 'string' }, I = { type: 'integer' }, B = { type: 'boolean' }, A = items => ({ type: 'array', items });
export const SCHEMA = obj({
  headline: { type: 'string', description: 'One plain sentence, at most 14 words: the single thing to remember' },
  summary: { type: 'string', description: '2-3 sentences' },
  takeaways: { ...A(S), description: 'Exactly 3 short lines (max 16 words each) a person should remember' },
  exposure_2030: I,
  evidence_quality: { type: 'string', enum: ['strong', 'partial', 'thin'] },
  market_read: { type: 'string', description: 'At most 50 words about demand for this person right now' },
  tasks: A(obj({ task: S, short: { type: 'string', description: 'label of at most 3 words' }, share_of_week: { type: 'integer', description: 'percent of a normal week; all tasks add up to about 100' },
    exposure: { type: 'integer', description: '0-100: share of this task AI can do or substantially speed up today' }, category: { type: 'string', enum: ['automate', 'augment', 'human'] },
    headline: { type: 'string', description: 'at most 12 words' }, detail: S })),
  human_edge: A(obj({ headline: S, detail: S })),
  skill_map: A(obj({ skill: S, status: { type: 'string', enum: ['has', 'partial', 'missing'] }, note: S })),
  future_roles: A(obj({ title: S, fit: I, timeline: S, why: S, gap: A(S), evidence_ids: A(S) })),
  skills_to_learn: A(obj({ skill: S, reason: S, hours: I })),
  plan: A(obj({ days: S, goal: S, steps: A(obj({ action: S, hours: I, deliverable: S, resources: A(obj({ title: S, provider: S, url: S, free: B })) })) })),
});

// Coerce model output into the shape the UI expects (models without strict schemas drift). phases: [{label}] the plan must follow.
export function validate(o, { phases = [] } = {}) {
  const int = (v, d = 0, max = 100) => Math.max(0, Math.min(max, Math.round(Number(v)) || d));
  const str = (v, n = 600) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, n);
  const arr = v => (Array.isArray(v) ? v : []);
  const cat = v => (['automate', 'augment', 'human'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : 'augment');
  const words = (v, n) => str(v).split(/\s+/).slice(0, n).join(' ');
  const tasks = arr(o.tasks).slice(0, 9).map(t => ({ task: str(t.task, 160), short: words(t.short || t.task, 3), share_of_week: int(t.share_of_week), exposure: int(t.exposure),
    category: cat(t.category), headline: str(t.headline || t.why || t.task, 140), detail: str(t.detail || t.why) })).filter(t => t.task);
  let plan = arr(o.plan).map(p => ({ days: str(p.days, 40), goal: str(p.goal || p.phase, 160),
    steps: arr(p.steps).slice(0, 6).map(st => typeof st === 'string' ? { action: str(st, 300), hours: 0, deliverable: '', resources: [] }
      : { action: str(st.action, 300), hours: int(st.hours, 0, 200), deliverable: str(st.deliverable, 200), resources: arr(st.resources).slice(0, 3).map(r => ({ title: str(r.title, 140), provider: str(r.provider, 60), url: str(r.url, 400), free: r.free !== false })) })
      .filter(st => st.action) })).filter(p => p.steps.length);
  if (phases.length) plan = phases.map((ph, i) => ({ ...(plan[i] || { goal: '', steps: [] }), days: ph.label })).filter(p => p.steps.length);
  const out = {
    version: 2,
    headline: words(o.headline, 18), summary: str(o.summary, 500), takeaways: arr(o.takeaways).map(t => str(t, 140)).filter(Boolean).slice(0, 3),
    exposure_2030: o.exposure_2030 == null ? null : int(o.exposure_2030),
    evidence_quality: ['strong', 'partial', 'thin'].includes(o.evidence_quality) ? o.evidence_quality : 'partial', market_read: str(o.market_read, 400),
    tasks,
    human_edge: arr(o.human_edge).map(h => typeof h === 'string' ? { headline: str(h, 140), detail: '' } : { headline: str(h.headline, 140), detail: str(h.detail) }).filter(h => h.headline).slice(0, 6),
    skill_map: arr(o.skill_map).map(s => ({ skill: str(s.skill, 60), status: ['has', 'partial', 'missing'].includes(s.status) ? s.status : 'missing', note: str(s.note, 200) })).filter(s => s.skill).slice(0, 30),
    future_roles: arr(o.future_roles).slice(0, 5).map(r => ({ title: str(r.title, 120), fit: int(r.fit), timeline: str(r.timeline, 40), why: str(r.why, 300), gap: arr(r.gap).map(g => str(g, 80)).filter(Boolean).slice(0, 6), evidence_ids: arr(r.evidence_ids).map(x => str(x, 300)) })).filter(r => r.title),
    skills_to_learn: arr(o.skills_to_learn).slice(0, 8).map(k => (typeof k === 'string' ? { skill: str(k, 80), reason: '', hours: 0 } : { skill: str(k.skill, 80), reason: str(k.reason, 240), hours: int(k.hours, 0, 500) })).filter(k => k.skill),
    plan,
  };
  if (!out.tasks.length || !out.plan.length) throw Object.assign(new Error('The AI returned an incomplete answer. Please try again.'), { status: 502 });
  return out;
}
