// "For you": narrow candidates in SQL, then score each one against the person's profile and explain why it matched.
import { db } from './db.mjs';
import { shape, cached } from './queries.mjs';
import { roleFamily, canonicalSkill, citiesNear, FAMILY_LABEL } from './normalize.mjs';
import { HIDE_BELOW } from './trust.mjs';

const J = v => JSON.stringify(v);
const LIST = n => `array(select jsonb_array_elements_text($${n}::jsonb))`;
const BROAD = new Set(['software', 'other', 'operations']);

// which job levels suit someone, from their situation and years
export function levelsFor(p) {
  const y = p.years === '' || p.years == null ? null : +p.years;
  if (p.status === 'student') return ['intern', 'entry'];
  if (p.status === 'fresher' || (y != null && y < 1)) return ['intern', 'entry', 'junior'];
  if (y == null) return ['entry', 'junior', 'mid'];
  if (y < 3) return ['entry', 'junior', 'mid'];
  if (y < 6) return ['junior', 'mid', 'senior'];
  if (y < 9) return ['mid', 'senior', 'lead'];
  return ['senior', 'lead'];
}

const idfTable = () => cached('idf', 30 * 60e3, async () => {
  const rows = await db().q(`select unnest(skills) as k, count(*)::int as v from postings where status = 'active' group by 1`);
  const [{ n }] = await db().q(`select count(*)::int as n from postings where status = 'active'`);
  return new Map(rows.map(r => [r.k, Math.log((n + 1) / (r.v + 1)) + 1]));
});

const LEVEL_WORD = { intern: 'internship', entry: 'fresher-friendly', junior: 'junior level', mid: 'mid level', senior: 'senior level', lead: 'lead level' };

export async function recommend(p, { limit = 20, avoid = {} } = {}) {
  const mine = [...new Set([...(p.skills || []).map(s => s.name), ...(p.technologies || [])].map(canonicalSkill))];
  const mineLow = new Set(mine.map(s => s.toLowerCase()));
  const targetFam = p.target ? roleFamily(p.target) : null, roleFam = p.role ? roleFamily(p.role) : null;
  const fams = [...new Set([targetFam, roleFam].filter(f => f && f !== 'other'))];
  const levels = levelsFor(p);
  const near = [...new Set((p.locations || []).flatMap(c => citiesNear(c, 50)))];
  const country = p.country || '';

  const params = [J(fams), J(mine)];
  const ors = [];
  if (near.length) ors.push(`cities && ${LIST(params.push(J(near)))}`);
  if (country) {
    const ci = params.push(J([country]));
    ors.push(`(work_mode = 'remote' and (countries = '{}' or countries && ${LIST(ci)}))`);
    if (!near.length || p.relocate) ors.push(`countries && ${LIST(ci)}`);
  } else if (near.length) ors.push(`work_mode = 'remote'`);
  const placeSql = ors.length ? ` and (${ors.join(' or ')})` : '';
  const base = `select id, title, company, company_category, location_raw, cities, countries, url, posted_at, first_seen, status, work_mode, seniority, role_family,
      employment_type, salary_min, salary_max, salary_currency, skills, ai, source, source_kind, trust_score, trust_flags, left(text, 240) as snippet
    from postings where status = 'active' and trust_score >= ${HIDE_BELOW} and reports < 3
      and (role_family = any(${LIST(1)}) or skills && ${LIST(2)})`;
  let rows = await db().q(`${base}${placeSql} order by coalesce(posted_at, first_seen) desc limit 800`, params);
  let relaxed = false;
  if (rows.length < limit && placeSql) { rows = await db().q(`${base} order by coalesce(posted_at, first_seen) desc limit 800`, params.slice(0, 2)); relaxed = true; }

  const idf = await idfTable();
  const modes = p.workModes || [];
  const scored = rows.map(r => {
    const js = (r.skills || []).slice(0, 14);
    const have = js.filter(s => mineLow.has(s.toLowerCase()));
    const wAll = js.reduce((a, s) => a + (idf.get(s) || 1), 0), wHave = have.reduce((a, s) => a + (idf.get(s) || 1), 0);
    const skill = wAll ? (wHave / wAll) * Math.min(1, js.length / 4) : 0;   // 1 of 1 skills is weak evidence
    const fam = r.role_family === targetFam ? 1 : r.role_family === roleFam && !BROAD.has(roleFam) ? 0.7 : fams.includes(r.role_family) ? 0.6 : 0;
    const lvl = levels.includes(r.seniority) ? 1 : r.seniority === 'unknown' ? 0.6 : 0.1;
    const inCity = near.length && (r.cities || []).some(c => near.includes(c));
    const place = inCity ? 1 : r.work_mode === 'remote' && (!country || !r.countries?.length || r.countries.includes(country)) ? 0.85 : country && r.countries?.includes(country) ? 0.5 : near.length || country ? 0 : 0.5;
    const mode = !modes.length || modes.includes(r.work_mode) ? 1 : r.work_mode === 'unknown' ? 0.7 : 0.3;
    const days = (Date.now() - new Date(r.posted_at || r.first_seen).getTime()) / 864e5;
    const fresh = Math.exp(-Math.max(0, days) / 30);
    const penalty = Math.min(1, (avoid[r.role_family] || 0) / 3);
    const score = (lvl < 0.5 ? 0.65 : 1) * (fams.length && !fam ? 0.6 : 1) * (0.34 * skill + 0.24 * fam + 0.16 * lvl + 0.12 * place * mode + 0.08 * fresh + 0.06 * (r.trust_score / 100) - 0.12 * penalty);
    const city = inCity ? (r.cities || []).find(c => near.includes(c)) : null;
    const why = [
      js.length ? `Matches ${have.length} of ${js.length} skills` : null,
      levels.includes(r.seniority) ? LEVEL_WORD[r.seniority] : null,
      r.work_mode !== 'unknown' ? `${{ remote: 'Remote', hybrid: 'Hybrid', onsite: 'Office' }[r.work_mode]}${city ? ` in ${city}` : ''}` : city,
      days < 1.5 ? 'posted today' : days < 8 ? `posted ${Math.round(days)} d ago` : null,
    ].filter(Boolean).join(' · ');
    return { r, score, why, have, missing: js.filter(s => !mineLow.has(s.toLowerCase())).slice(0, 4) };
  }).sort((a, b) => b.score - a.score);

  // keep the list varied: at most 3 roles from one company
  const perCo = new Map(), seen = new Set(), out = [];
  for (const x of scored) {
    const k = x.r.company.toLowerCase(), n = perCo.get(k) || 0, dup = `${k}|${x.r.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (n >= 3 || seen.has(dup)) continue;          // the same job is often listed on several boards
    seen.add(dup);
    perCo.set(k, n + 1);
    out.push({ ...shape(x.r), why: x.why, match: Math.round(x.score * 100), have: x.have, missing: x.missing });
    if (out.length >= limit) break;
  }
  return { items: out, relaxed, families: fams.map(f => FAMILY_LABEL[f]), levels };
}
