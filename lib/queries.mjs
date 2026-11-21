// Read queries over the job store: search with filters and facet counts, market stats, suggestions.
import { db, lastRun } from './db.mjs';
import { extractSkills, citiesNear, roleFamily, TECH_FAMILIES, FAMILY_LABEL, SENIORITY_LABEL } from './normalize.mjs';
import { HIDE_BELOW, badge, FLAG_REASON } from './trust.mjs';

const J = v => JSON.stringify(v);
const LIST = n => `array(select jsonb_array_elements_text($${n}::text::jsonb))`;

/* ---------------- keyword → tsquery with job-title synonyms ---------------- */
const DEV = ['developer', 'engineer', 'programmer', 'sde', 'swe'];
const SYN = {
  developer: DEV, engineer: DEV, programmer: DEV, sde: DEV, swe: DEV, dev: DEV,
  frontend: ['frontend', 'front <-> end', 'ui'], backend: ['backend', 'back <-> end'], fullstack: ['fullstack', 'full <-> stack'],
  ml: ['ml', 'machine <-> learning'], ai: ['ai', 'artificial <-> intelligence'], devops: ['devops', 'sre', 'site <-> reliability'],
  qa: ['qa', 'test', 'sdet', 'quality <-> assurance'], ux: ['ux', 'user <-> experience'], pm: ['product <-> manager'],
  js: ['javascript', 'js'], k8s: ['kubernetes', 'k8s'], golang: ['go', 'golang'],
};
const STOPWORDS = new Set('a an and or the of in for to with at on job jobs role roles position opening openings'.split(' '));
export function tsq(q) {
  const s = String(q || '').toLowerCase().replace(/front[\s-]?end/g, 'frontend').replace(/back[\s-]?end/g, 'backend').replace(/full[\s-]?stack/g, 'fullstack')
    .replace(/machine learning/g, 'ml').replace(/\bc\+\+/g, 'cpp').replace(/\bc#/g, 'csharp').replace(/node\.?js/g, 'node');
  const toks = [...new Set((s.match(/[a-z0-9]+/g) || []).filter(t => !STOPWORDS.has(t)))].slice(0, 8);
  return toks.map(t => `(${(SYN[t] || [t]).map(a => a.split(' <-> ').map(w => `'${w}'`).join(' <-> ')).join(' | ')})`).join(' & ');
}

/* small TTL cache for expensive aggregate queries */
const CACHE = new Map();
export async function cached(key, ms, fn) {
  const c = CACHE.get(key);
  if (c && Date.now() - c.t < ms) return c.v;
  const v = await fn();
  CACHE.set(key, { t: Date.now(), v });
  if (CACHE.size > 400) CACHE.delete(CACHE.keys().next().value);
  return v;
}
export const clearCache = () => CACHE.clear();

/* ---------------- filters ---------------- */
// f: { q, family[], seniority[], mode[], city, radius, countries[], type[], days, category[], salary, includeOld, showFlagged, tech, ai }
export function where(f = {}, skip = '') {
  const parts = [], params = [];
  const p = v => (params.push(v), params.length);
  parts.push(f.includeOld ? `status in ('active','stale','closed')` : `status = 'active'`);
  if (!f.showFlagged) parts.push(`trust_score >= ${HIDE_BELOW} and reports < 3`);
  const tq = tsq(f.q);
  if (tq) {
    const qi = p(tq), sk = extractSkills(f.q, 5);
    parts.push(`(ts_filter(tsv, '{a,b}') @@ to_tsquery('english', $${qi})${sk.length ? ` or skills @> ${LIST(p(J(sk)))}` : ''})`);
  }
  if (f.tech && skip !== 'family' && !f.family?.length) parts.push(`role_family = any(${LIST(p(J(TECH_FAMILIES)))})`);
  if (f.family?.length && skip !== 'family') parts.push(`role_family = any(${LIST(p(J(f.family)))})`);
  if (f.seniority?.length && skip !== 'seniority') parts.push(`seniority = any(${LIST(p(J(f.seniority)))})`);
  if (f.mode?.length && skip !== 'mode') parts.push(`work_mode = any(${LIST(p(J(f.mode)))})`);
  if (f.type?.length && skip !== 'type') parts.push(`employment_type = any(${LIST(p(J(f.type)))})`);
  if (f.category?.length && skip !== 'category') parts.push(`company_category = any(${LIST(p(J(f.category)))})`);
  if (skip !== 'place') {
    const near = f.city ? citiesNear(f.city, f.radius || 50) : [];
    // a remote role open to the person's country still counts as "near" them
    if (near.length && f.countries?.length) parts.push(`(cities && ${LIST(p(J(near)))} or (work_mode = 'remote' and countries && ${LIST(p(J(f.countries)))}))`);
    else if (near.length) parts.push(`cities && ${LIST(p(J(near)))}`);
    else if (f.countries?.length) parts.push(`countries && ${LIST(p(J(f.countries)))}`);
  }
  if (f.days) parts.push(`coalesce(posted_at, first_seen) > now() - make_interval(days => $${p(+f.days)}::int)`);
  if (f.salary) parts.push('salary_max is not null');
  if (f.ai) parts.push('ai');
  return { sql: parts.join(' and '), params };
}

const ROW = `id, title, company, company_category, location_raw, cities, countries, url, posted_at, first_seen, status, work_mode, seniority, role_family,
  employment_type, salary_min, salary_max, salary_currency, skills, ai, source, source_kind, trust_score, trust_flags, left(text, 240) as snippet`;
export const shape = r => ({
  id: r.id, title: r.title, company: r.company, category: r.company_category, location: r.location_raw, cities: r.cities, countries: r.countries,
  url: r.url, posted: (r.posted_at || r.first_seen) ? new Date(r.posted_at || r.first_seen).toISOString() : null, status: r.status,
  work_mode: r.work_mode, remote: r.work_mode === 'remote', seniority: r.seniority, family: r.role_family, family_label: FAMILY_LABEL[r.role_family] || 'Other',
  type: r.employment_type, salary: r.salary_max ? { min: r.salary_min, max: r.salary_max, currency: r.salary_currency } : null,
  skills: r.skills, ai: r.ai, source: r.source, kind: r.source_kind, snippet: r.snippet,
  trust: { score: r.trust_score, ...badge(r.trust_score, r.source_kind), reasons: (r.trust_flags || []).map(f => FLAG_REASON[f]).filter(Boolean) },
});

// the same job is often listed on several boards; keep the first of each company + title
export const dedupe = list => { const seen = new Set(); return list.filter(j => { const k = `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' '); return !seen.has(k) && seen.add(k); }); };

export async function search(f, { page = 1, per = 20 } = {}) {
  const { sql, params } = where(f);
  const countParams = params.length;
  const order = tsq(f.q) ? `(strpos(lower(title), $${params.push(String(f.q).toLowerCase().trim())}) > 0) desc, ts_rank(tsv, to_tsquery('english', $1)) * (1 + 1 / (1 + extract(epoch from now() - coalesce(posted_at, first_seen)) / 864000)) desc`
    : 'coalesce(posted_at, first_seen) desc';
  const [rows, [{ n }]] = await Promise.all([
    db().q(`select ${ROW} from postings where ${sql} order by ${order}, id limit ${per} offset ${(page - 1) * per}`, params),
    db().q(`select count(*)::int as n from postings where ${sql}`, params.slice(0, countParams)),
  ]);
  return { total: n, page, per, pages: Math.ceil(n / per), items: dedupe(rows.map(shape)) };
}

// disjunctive facets: each dimension is counted with every other filter applied
export async function facets(f) {
  const dims = { family: 'role_family', seniority: 'seniority', mode: 'work_mode', type: 'employment_type', category: 'company_category' };
  const out = {};
  await Promise.all(Object.entries(dims).map(async ([k, col]) => {
    const { sql, params } = where(f, k);
    out[k] = (await db().q(`select ${col} as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 40`, params)).filter(r => r.k);
  }));
  const { sql, params } = where(f, 'place');
  out.city = await db().q(`select unnest(cities) as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 30`, params);
  out.country = await db().q(`select unnest(countries) as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 30`, params);
  out.family = out.family.map(r => ({ ...r, label: FAMILY_LABEL[r.k] || 'Other', tech: TECH_FAMILIES.includes(r.k) }));
  out.seniority = out.seniority.map(r => ({ ...r, label: SENIORITY_LABEL[r.k] || r.k }));
  return out;
}

export async function job(id) {
  const [r] = await db().q(`select ${ROW.replace('left(text, 240) as snippet', 'text as snippet')} from postings where id = $1`, [id]);
  return r ? shape(r) : null;
}
export async function similar(j, n = 6) {
  return (await db().q(`select ${ROW} from postings where status = 'active' and trust_score >= ${HIDE_BELOW} and id <> $1 and role_family = $2
    order by cardinality(array(select unnest(skills) intersect select unnest(${LIST(3)}))) desc, coalesce(posted_at, first_seen) desc limit ${n}`, [j.id, j.family, J(j.skills || [])])).map(shape);
}

/* ---------------- market-wide trends ---------------- */
export function trends() {
  return cached('trends', 10 * 60e3, async () => {
    const q = db().q;
    const [[t], emerging, companies, skills, fam, modes, countries, run] = await Promise.all([
      q(`select count(*)::int as total, count(distinct lower(company))::int as companies,
          avg(ai::int)::float as ai_rate, avg(ai_title::int)::float as ai_roles, avg((work_mode = 'remote')::int)::float as remote,
          avg((work_mode = 'hybrid')::int)::float as hybrid,
          count(*) filter (where coalesce(posted_at, first_seen) > now() - interval '7 days')::int as week
        from postings where status = 'active'`),
      q(`select norm_title as k, count(*)::int as v from postings where status = 'active' and ai_title and length(norm_title) > 3 group by 1 order by 2 desc limit 25`),
      q(`select company as k, count(*)::int as v from postings where status = 'active' group by 1 order by 2 desc limit 20`),
      q(`select unnest(skills) as k, count(*)::int as v from postings where status = 'active' and role_family = any(${LIST(1)}) group by 1 order by 2 desc limit 40`, [J(TECH_FAMILIES)]),
      q(`select role_family as k, count(*)::int as v from postings where status = 'active' group by 1 order by 2 desc`),
      q(`select work_mode as k, count(*)::int as v from postings where status = 'active' group by 1 order by 2 desc`),
      q(`select unnest(countries) as k, count(*)::int as v from postings where status = 'active' group by 1 order by 2 desc limit 15`),
      lastRun(),
    ]);
    return {
      total: t.total, companies: t.companies, aiMentionRate: t.ai_rate || 0, aiRoleShare: t.ai_roles || 0, remoteShare: t.remote || 0, hybridShare: t.hybrid || 0, newThisWeek: t.week,
      emergingRoles: emerging, topCompanies: companies, topSkills: skills, topTags: skills,
      families: fam.map(r => ({ ...r, label: FAMILY_LABEL[r.k] || 'Other', tech: TECH_FAMILIES.includes(r.k) })), modes, countries,
      collectedAt: run?.started_at ? new Date(run.started_at).toISOString() : null, sources: run?.sources || [],
    };
  });
}

/* ---------------- one role's market ---------------- */
const BROAD = new Set(['software', 'other', 'operations', 'sales', 'marketing', 'trades', 'mech', 'customer', 'finance', 'people', 'legal', 'healthcare', 'education']);
// a specific tech role ("frontend developer") is measured by its whole role family; anything else by keyword
export const marketFilter = (q, f = {}) => { const fam = roleFamily(q); return BROAD.has(fam) ? { ...f, q } : { ...f, family: [fam] }; };
export function market(q, f = {}) {
  return cached('market:' + J([q, f]), 10 * 60e3, async () => {
    const { sql, params } = where(marketFilter(q, f));
    const [[s], companies, locs, titles, skills, posts] = await Promise.all([
      db().q(`select count(*)::int as n, avg(ai::int)::float as ai, avg((work_mode = 'remote')::int)::float as remote, avg((work_mode = 'hybrid')::int)::float as hybrid,
        count(*) filter (where coalesce(posted_at, first_seen) > now() - interval '30 days')::int as month from postings where ${sql}`, params),
      db().q(`select company as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 12`, params),
      db().q(`select unnest(cities) as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 10`, params),
      db().q(`select norm_title as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 12`, params),
      db().q(`select unnest(skills) as k, count(*)::int as v from postings where ${sql} group by 1 order by 2 desc limit 25`, params),
      db().q(`select ${ROW} from postings where ${sql} order by coalesce(posted_at, first_seen) desc limit 15`, params),
    ]);
    return { query: q, count: s.n, lastMonth: s.month, aiMentionRate: s.ai || 0, remoteShare: s.remote || 0, hybridShare: s.hybrid || 0,
      companies, locations: locs, titles, skills: skills.map(r => ({ ...r, share: s.n ? r.v / s.n : 0 })), tags: skills, postings: dedupe(posts.map(shape)) };
  });
}

/* ---------------- typeahead for roles ---------------- */
export function suggest(q) {
  const s = String(q).toLowerCase().trim();
  if (s.length < 2) return [];
  return cached('suggest:' + s, 30 * 60e3, async () => (await db().q(
    `select norm_title as k, count(*)::int as v from postings where status = 'active' and norm_title like $1 and length(norm_title) between 3 and 60 and norm_title ~ '^[a-z][a-z0-9 +#./&()-]*$'
     group by 1 order by (norm_title like $2) desc, 2 desc limit 8`, [`%${s.replace(/[%_]/g, '')}%`, `${s.replace(/[%_]/g, '')}%`])));
}

/* ---------------- evidence pool for the AI adviser ---------------- */
export async function pool(profile, limit = 45) {
  const take = async (q, n) => q ? (await db().q(`select ${ROW.replace('left(text, 240)', 'left(text, 700)')} from postings where ${where({ q }).sql}
    order by ts_rank(tsv, to_tsquery('english', $1)) desc, coalesce(posted_at, first_seen) desc limit ${n}`, where({ q }).params)).map(r => ({ ...shape(r), text: r.snippet })) : [];
  const skills = extractSkills(profile.skills || '', 10);
  const [a, b, c] = await Promise.all([
    take(profile.role, 25), take(profile.target, 12),
    skills.length ? db().q(`select ${ROW.replace('left(text, 240)', 'left(text, 700)')} from postings where status = 'active' and ai_title and skills && ${LIST(1)}
      order by coalesce(posted_at, first_seen) desc limit 10`, [J(skills)]).then(rs => rs.map(r => ({ ...shape(r), text: r.snippet }))) : [],
  ]);
  return [...new Map([...a, ...b, ...c].map(p => [p.id, p])).values()].slice(0, limit);
}

/* ---------------- the job map: role families, skills and companies linked by co-occurrence ---------------- */
export function graph() {
  return cached('graph', 30 * 60e3, async () => {
    const q = db().q, tech = J(TECH_FAMILIES);
    const [fams, famSkill, famCo, pairs] = await Promise.all([
      q(`select role_family as k, count(*)::int as v from postings where status = 'active' and role_family = any(${LIST(1)}) group by 1 order by 2 desc limit 16`, [tech]),
      q(`select role_family as f, s, count(*)::int as v from postings, unnest(skills[1:10]) as s where status = 'active' and role_family = any(${LIST(1)}) group by 1, 2`, [tech]),
      q(`select role_family as f, company as c, count(*)::int as v from postings where status = 'active' and role_family = any(${LIST(1)}) group by 1, 2`, [tech]),
      q(`select a.s as a, b.s as b, count(*)::int as v from
          (select id, s from postings, unnest(skills[1:8]) as s where status = 'active' and role_family = any(${LIST(1)})) a
          join (select id, s from postings, unnest(skills[1:8]) as s where status = 'active' and role_family = any(${LIST(1)})) b on a.id = b.id and a.s < b.s
          group by 1, 2 order by 3 desc limit 90`, [tech]),
    ]);
    const famIds = new Set(fams.map(f => f.k));
    const top = (rows, key, n) => {
      const by = new Map();
      for (const r of rows) if (famIds.has(r.f)) (by.get(r.f) || by.set(r.f, []).get(r.f)).push(r);
      return [...by.values()].flatMap(list => list.sort((a, b) => b.v - a.v).slice(0, n));
    };
    const fs = top(famSkill, 's', 7), fc = top(famCo, 'c', 3);
    const skillCount = new Map(), coCount = new Map();
    for (const r of famSkill) skillCount.set(r.s, (skillCount.get(r.s) || 0) + r.v);
    for (const r of famCo) coCount.set(r.c, (coCount.get(r.c) || 0) + r.v);
    const skills = new Set([...fs.map(r => r.s), ...pairs.slice(0, 50).flatMap(p => [p.a, p.b])]);
    const cos = new Set(fc.map(r => r.c));
    return {
      nodes: [
        ...fams.map(f => ({ id: 'f:' + f.k, kind: 'family', key: f.k, label: FAMILY_LABEL[f.k], v: f.v })),
        ...[...skills].map(s => ({ id: 's:' + s, kind: 'skill', key: s, label: s, v: skillCount.get(s) || 1 })),
        ...[...cos].map(c => ({ id: 'c:' + c, kind: 'company', key: c, label: c, v: coCount.get(c) || 1 })),
      ],
      edges: [
        ...fs.map(r => ({ a: 'f:' + r.f, b: 's:' + r.s, v: r.v })),
        ...fc.map(r => ({ a: 'f:' + r.f, b: 'c:' + r.c, v: r.v })),
        ...pairs.filter(p => skills.has(p.a) && skills.has(p.b)).slice(0, 50).map(p => ({ a: 's:' + p.a, b: 's:' + p.b, v: p.v })),
      ],
    };
  });
}
