// Checks company job-board tokens against the public ATS APIs and prints which are live.
// Usage: node scripts/check-sources.mjs [candidates.json]   (defaults to sources.json)
// A candidates file has the same shape as sources.json: { boards: { category: { ats: [tokens] } } }
import fs from 'node:fs/promises';
import { ATS_URL } from '../lib/collect.mjs';

const file = process.argv[2] || new URL('../sources.json', import.meta.url).pathname;
const cfg = JSON.parse(await fs.readFile(file, 'utf8'));
const tasks = [];
for (const [cat, byAts] of Object.entries(cfg.boards)) for (const [ats, list] of Object.entries(byAts)) for (const t of list) tasks.push({ cat, ats, t });

const count = d => Array.isArray(d) ? d.length : (d.jobs || d.offers || d.content || []).length;
const out = {};
let i = 0;
async function worker() {
  while (i < tasks.length) {
    const { cat, ats, t } = tasks[i++];
    let n = -1;
    try {
      const r = await fetch(ATS_URL[ats](t), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) n = count(await r.json());
    } catch {}
    console.error(`${n > 0 ? 'ok  ' : 'dead'} ${ats}:${t} ${n}`);
    if (n > 0) ((out[cat] ||= {})[ats] ||= []).push(t);
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
for (const c of Object.values(out)) for (const k of Object.keys(c)) c[k].sort();
console.log(JSON.stringify(out, null, 2));
