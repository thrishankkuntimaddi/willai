// Deterministic scoring. The AI describes tasks and maps skills; the numbers people see are computed here,
// from that description and from live postings, so every score can be shown as a table that adds up.
import { canonicalSkill } from './normalize.mjs';

const round = x => Math.round(x);

// AI exposure = time-weighted average of how much AI can do in each task.
export function exposureScore(tasks) {
  const total = tasks.reduce((a, t) => a + (t.share_of_week || 0), 0) || tasks.length;
  const rows = tasks.map(t => {
    const share = tasks.some(x => x.share_of_week) ? (t.share_of_week || 0) / total : 1 / tasks.length;
    return { task: t.task, short: t.short, category: t.category, share: +(share * 100).toFixed(1), exposure: t.exposure, contribution: +(share * t.exposure).toFixed(1) };
  });
  return { value: round(rows.reduce((a, r) => a + r.contribution, 0)), rows };
}

const LEVEL_CREDIT = { 3: 1, 2: 1, 1: 0.5 };
const STATUS_CREDIT = { has: 1, partial: 0.5, missing: 0 };

// Readiness for the target role = demand-weighted share of the skills employers ask for that the person already has.
// demanded: [{ k: skill, share: 0..1 }] from live postings for the target. mine: [{ name, level 1-3 }]. aiMap: [{ skill, status }] from the model.
export function readinessScore(demanded, mine = [], aiMap = []) {
  const top = demanded.filter(d => d.share >= 0.03).slice(0, 15);
  if (!top.length) return { value: null, rows: [] };
  const own = new Map(mine.map(s => [canonicalSkill(s.name).toLowerCase(), +s.level || 2]));
  const ai = new Map(aiMap.map(s => [canonicalSkill(s.skill).toLowerCase(), s.status]));
  const totalW = top.reduce((a, d) => a + d.share, 0);
  const rows = top.map(d => {
    const key = d.k.toLowerCase();
    let status, source;
    if (own.has(key)) { status = own.get(key) >= 2 ? 'has' : 'partial'; source = 'you'; }
    else if (ai.has(key)) { status = ai.get(key); source = 'inferred'; }       // e.g. REST APIs inferred from a project
    else { status = 'missing'; source = 'none'; }
    if (!STATUS_CREDIT.hasOwnProperty(status)) status = 'missing';
    const weight = d.share / totalW;
    return { skill: d.k, asked_in: +(d.share * 100).toFixed(0), weight: +(weight * 100).toFixed(1), status, source, contribution: +(weight * STATUS_CREDIT[status] * 100).toFixed(1) };
  });
  return { value: round(rows.reduce((a, r) => a + r.contribution, 0)), rows };
}
export { LEVEL_CREDIT };

// Plan length → phases. Short plans go week by week, long ones month by month (at most 6 phases).
export function phasesFor(days) {
  const d = Math.max(7, Math.min(365, Math.round(+days || 90)));
  const len = d <= 35 ? 7 : d <= 70 ? 15 : d <= 180 ? 30 : Math.ceil(d / 6);
  const out = [];
  for (let s = 1; s <= d; s += len) out.push({ from: s, to: Math.min(d, s + len - 1) });
  if (out.length > 1 && out.at(-1).to - out.at(-1).from < len / 3) { const last = out.pop(); out.at(-1).to = last.to; }   // fold a tiny tail
  return out.map(p => ({ ...p, label: `Days ${p.from}–${p.to}` }));
}

// Only link straight to well-known learning sites; anything else becomes a search, so the AI cannot invent dead links.
const ALLOWED = ['developer.mozilla.org', 'freecodecamp.org', 'roadmap.sh', 'coursera.org', 'edx.org', 'nptel.ac.in', 'swayam.gov.in', 'learn.microsoft.com',
  'cloud.google.com', 'developers.google.com', 'aws.amazon.com', 'skillbuilder.aws', 'kaggle.com', 'youtube.com', 'docs.python.org', 'react.dev', 'nextjs.org',
  'nodejs.org', 'typescriptlang.org', 'kubernetes.io', 'docker.com', 'docs.docker.com', 'git-scm.com', 'github.com', 'docs.github.com', 'leetcode.com',
  'neetcode.io', 'khanacademy.org', 'fast.ai', 'huggingface.co', 'deeplearning.ai', 'pytorch.org', 'tensorflow.org', 'postgresql.org', 'w3schools.com',
  'javascript.info', 'theodinproject.com', 'cs50.harvard.edu', 'ocw.mit.edu', 'udemy.com', 'linkedin.com', 'docs.anthropic.com', 'platform.openai.com',
  'ai.google.dev', 'web.dev', 'css-tricks.com', 'testautomationu.applitools.com', 'owasp.org', 'tryhackme.com', 'hackthebox.com', 'spring.io', 'go.dev', 'rust-lang.org', 'kotlinlang.org', 'developer.android.com', 'developer.apple.com', 'flutter.dev', 'dbt.com', 'airflow.apache.org', 'spark.apache.org', 'figma.com', 'interaction-design.org', 'scrum.org', 'atlassian.com'];
export function safeResource(r) {
  const title = String(r.title || '').slice(0, 140), provider = String(r.provider || '').slice(0, 60);
  let url = null;
  try {
    const u = new URL(String(r.url || ''));
    if (u.protocol === 'https:' && ALLOWED.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) url = u.toString();
  } catch {}
  return { title, provider, free: r.free !== false, url: url || `https://www.google.com/search?q=${encodeURIComponent(`${title} ${provider}`.trim())}`, direct: !!url };
}
