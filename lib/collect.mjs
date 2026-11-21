// Collects postings from official public job APIs, normalises them, scores trust, and stores them.
// Company ATS boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee), open boards, and key-based aggregators.
// No scraping: LinkedIn, Naukri and similar sites have no public job API and forbid scraping.
import fs from 'node:fs/promises';
import { normalize } from './normalize.mjs';
import { assess } from './trust.mjs';
import * as store from './db.mjs';

const UA = 'WillAI-JobMarketResearch/2.0 (+public job board APIs)';
export async function getJSON(url, { ms = 45000, headers = {}, method = 'GET', body } = {}) {
  const r = await fetch(url, { method, body, headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const ATS_URL = {
  greenhouse: t => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`,
  lever: t => `https://api.lever.co/v0/postings/${t}?mode=json`,
  ashby: t => `https://api.ashbyhq.com/posting-api/job-board/${t}`,
  workable: t => `https://apply.workable.com/api/v1/widget/accounts/${t}`,
  smartrecruiters: t => `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`,
  recruitee: t => `https://${t}.recruitee.com/api/offers/`,
};
const decode = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/* ---------------- company ATS boards ---------------- */
const ATS = {
  greenhouse: async t => (await getJSON(ATS_URL.greenhouse(t))).jobs.map(j => ({
    rawId: j.id, title: j.title, company: j.company_name || t, location: j.location?.name, url: j.absolute_url,
    posted: j.first_published || j.updated_at, dept: j.departments?.[0]?.name, text: decode(j.content),
  })),
  lever: async t => (await getJSON(ATS_URL.lever(t))).map(j => ({
    rawId: j.id, title: j.text, company: t, location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).join('; '), url: j.hostedUrl,
    posted: j.createdAt, dept: j.categories?.team, remote: j.workplaceType === 'remote', hybrid: j.workplaceType === 'hybrid',
    employment: j.categories?.commitment, text: `${j.descriptionPlain || ''} ${(j.lists || []).map(l => `${l.text}: ${l.content}`).join(' ')} ${j.additionalPlain || ''}`,
    salary: j.salaryRange?.min ? { min: j.salaryRange.min, max: j.salaryRange.max, currency: j.salaryRange.currency } : null,
  })),
  ashby: async t => (await getJSON(ATS_URL.ashby(t))).jobs.filter(j => j.isListed !== false).map(j => ({
    rawId: j.id, title: j.title, company: t, location: [j.location, ...(j.secondaryLocations || []).map(l => l.location)].filter(Boolean).join('; '),
    url: j.jobUrl, posted: j.publishedAt, dept: j.department, remote: j.isRemote || j.workplaceType === 'Remote', hybrid: j.workplaceType === 'Hybrid',
    employment: j.employmentType, text: j.descriptionPlain,
  })),
  workable: async t => { const d = await getJSON(ATS_URL.workable(t)); return (d.jobs || []).map(j => ({
    rawId: j.shortcode, title: j.title, company: d.name || t, location: (j.locations || []).filter(l => !l.hidden).map(l => [l.city, l.region, l.country].filter(Boolean).join(', ')).join('; ') || [j.city, j.country].filter(Boolean).join(', '),
    url: j.url || j.shortlink, posted: j.published_on || j.created_at, dept: j.department || j.function, remote: !!j.telecommuting, employment: j.employment_type,
    text: [j.function, j.industry, j.experience, j.education].filter(Boolean).join('. '),
  })); },
  smartrecruiters: async t => {
    const out = [];
    for (let off = 0; off < 500; off += 100) {
      const d = await getJSON(`${ATS_URL.smartrecruiters(t)}&offset=${off}`);
      out.push(...(d.content || []).map(j => ({
        rawId: j.id, title: j.name, company: j.company?.name || t, location: j.location?.fullLocation || [j.location?.city, j.location?.country].filter(Boolean).join(', '),
        url: `https://jobs.smartrecruiters.com/${t}/${j.id}`, posted: j.releasedDate, dept: j.department?.label || j.function?.label,
        remote: !!j.location?.remote, hybrid: !!j.location?.hybrid, employment: j.typeOfEmployment?.label, text: [j.experienceLevel?.label, j.industry?.label, j.function?.label].filter(Boolean).join('. '),
      })));
      if (!d.content?.length || off + 100 >= (d.totalFound || 0)) break;
    }
    return out;
  },
  recruitee: async t => (await getJSON(ATS_URL.recruitee(t))).offers.map(j => ({
    rawId: j.id, title: j.title, company: j.company_name || t, location: j.location || [j.city, j.country].filter(Boolean).join(', '), url: j.careers_url,
    posted: j.published_at || j.created_at, dept: j.department, remote: !!j.remote, hybrid: !!j.hybrid, employment: j.employment_type_code,
    text: `${j.description || ''} ${j.requirements || ''}`, salary: j.salary?.min ? { min: +j.salary.min, max: +j.salary.max || null, currency: j.salary.currency } : null,
  })),
};

/* ---------------- open boards (no key) ---------------- */
export const himalaya = j => ({
  source: 'himalayas', rawId: j.guid || j.applicationLink, title: j.title, company: j.companyName,
  location: (j.locationRestrictions || []).join(', ') || 'Remote', url: j.applicationLink, posted: j.pubDate ? j.pubDate * 1000 : null,
  dept: (j.parentCategories || [])[0], remote: true, tags: [...(j.categories || []), ...(j.parentCategories || [])], text: j.description || j.excerpt,
  salary: j.minSalary ? { min: j.minSalary, max: j.maxSalary, currency: j.currency || 'USD' } : null,
});
const OPEN = {
  remotive: async () => (await getJSON('https://remotive.com/api/remote-jobs')).jobs.map(j => ({
    rawId: j.id, title: j.title, company: j.company_name, location: j.candidate_required_location, url: j.url,
    posted: j.publication_date, dept: j.category, remote: true, tags: j.tags, text: j.description, employment: j.job_type,
  })),
  arbeitnow: async () => {
    const out = [];
    for (let p = 1; p <= 5; p++) {
      const d = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${p}`).catch(e => { if (p === 1) throw e; return null; });
      if (!d) break;
      out.push(...d.data.map(j => ({ rawId: j.slug, title: j.title, company: j.company_name, location: j.location, url: j.url,
        posted: j.created_at * 1000, remote: j.remote, tags: j.tags, text: j.description, employment: (j.job_types || []).join(' ') })));
      if (!d.links?.next) break;
    }
    return out;
  },
  himalayas: async () => {
    const out = [];
    for (let o = 0; o < 1000; o += 20) {
      const d = await getJSON(`https://himalayas.app/jobs/api?limit=20&offset=${o}`).catch(() => null);
      if (!d?.jobs?.length) break;
      out.push(...d.jobs.map(himalaya));
    }
    return out;
  },
  jobicy: async () => (await getJSON('https://jobicy.com/api/v2/remote-jobs?count=100')).jobs.map(j => ({
    rawId: j.id, title: j.jobTitle, company: j.companyName, location: j.jobGeo, url: j.url, posted: j.pubDate,
    dept: [].concat(j.jobIndustry || [])[0], remote: true, tags: [].concat(j.jobIndustry || []), text: j.jobDescription || j.jobExcerpt, employment: [].concat(j.jobType || []).join(' '),
  })),
  remoteok: async () => (await getJSON('https://remoteok.com/api')).filter(j => j.id).map(j => ({
    rawId: j.id, title: j.position, company: j.company, location: j.location, url: j.url, posted: j.date, remote: true, tags: j.tags, text: j.description,
    salary: j.salary_min ? { min: j.salary_min, max: j.salary_max, currency: 'USD' } : null,
  })),
  themuse: async () => {
    const out = [];
    for (const cat of ['Software Engineering', 'Data and Analytics', 'Data Science', 'Computer and IT', 'Design and UX', 'Product Management', 'IT']) {
      for (let p = 0; p < 6; p++) {
        const d = await getJSON(`https://www.themuse.com/api/public/jobs?category=${encodeURIComponent(cat)}&page=${p}`).catch(() => null);
        if (!d?.results?.length) break;
        out.push(...d.results.map(j => ({ rawId: j.id, title: j.name, company: j.company?.name, location: (j.locations || []).map(l => l.name).join('; '),
          url: j.refs?.landing_page, posted: j.publication_date, dept: (j.categories || [])[0]?.name, remote: (j.locations || []).some(l => /remote/i.test(l.name)),
          text: `${(j.levels || []).map(l => l.name).join(', ')} ${j.contents || ''}` })));
        if (p + 1 >= (d.page_count || 0)) break;
      }
    }
    return out;
  },
};

/* ---------------- aggregators (free keys, skipped when missing) ---------------- */
const env = process.env;
const TECH_KEYWORDS = ['software developer', 'software engineer', 'frontend developer', 'backend developer', 'full stack developer', 'java developer', 'python developer',
  'data engineer', 'data scientist', 'data analyst', 'devops engineer', 'cloud engineer', 'machine learning engineer', 'android developer', 'ios developer',
  'qa engineer', 'cyber security', 'ui ux designer', 'product manager', 'it support'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const adzunaMap = (j, country) => ({ source: 'adzuna', rawId: `${country}:${j.id}`, title: j.title, company: j.company?.display_name, location: [j.location?.display_name, ...(j.location?.area || []).slice(0, 1)].filter(Boolean).join(', '),
  url: j.redirect_url, posted: j.created, dept: j.category?.label, text: j.description, employment: `${j.contract_time || ''} ${j.contract_type || ''}`,
  salary: j.salary_min && j.salary_is_predicted !== '1' ? { min: j.salary_min, max: j.salary_max, currency: { in: 'INR', us: 'USD', gb: 'GBP', sg: 'SGD', ca: 'CAD', au: 'AUD' }[country] || 'EUR' } : null });

const AGG = {
  adzuna: { needs: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'], run: async () => {
    const plan = { in: +env.ADZUNA_PAGES_IN || 8, us: 3, gb: 3, sg: 2, de: 2, ca: 2, au: 2 };
    const out = [];
    for (const [c, pages] of Object.entries(plan)) for (let p = 1; p <= pages; p++) {
      const d = await getJSON(`https://api.adzuna.com/v1/api/jobs/${c}/search/${p}?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}&results_per_page=50&category=it-jobs&max_days_old=30&sort_by=date&content-type=application/json`).catch(() => null);
      await sleep(2600);                                   // free tier: 25 calls a minute
      if (!d?.results?.length) break;
      out.push(...d.results.map(j => adzunaMap(j, c)));
    }
    return out;
  } },
  jooble: { needs: ['JOOBLE_KEY'], run: async () => {
    const out = [];
    for (const kw of TECH_KEYWORDS) for (const location of ['India', 'Remote']) {
      const d = await getJSON(`https://jooble.org/api/${env.JOOBLE_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keywords: kw, location, page: 1 }) }).catch(() => null);
      out.push(...(d?.jobs || []).map(j => ({ source: 'jooble', rawId: j.id, title: j.title, company: j.company, location: j.location, url: j.link,
        posted: j.updated, text: j.snippet, employment: j.type, remote: location === 'Remote' || /remote/i.test(j.location || '') })));
      await sleep(300);
    }
    return out;
  } },
  usajobs: { needs: ['USAJOBS_KEY', 'USAJOBS_EMAIL'], run: async () => {
    const d = await getJSON('https://data.usajobs.gov/api/search?JobCategoryCode=2210&ResultsPerPage=500&SortField=opendate&SortDirection=desc',
      { headers: { Host: 'data.usajobs.gov', 'User-Agent': env.USAJOBS_EMAIL, 'Authorization-Key': env.USAJOBS_KEY } });
    return (d.SearchResult?.SearchResultItems || []).map(({ MatchedObjectId: id, MatchedObjectDescriptor: j }) => ({
      source: 'usajobs', rawId: id, title: j.PositionTitle, company: j.OrganizationName || j.DepartmentName, location: j.PositionLocationDisplayName || (j.PositionLocation || []).map(l => l.LocationName).join('; '),
      url: j.PositionURI, posted: j.PublicationStartDate, dept: j.DepartmentName, text: j.UserArea?.Details?.JobSummary || j.QualificationSummary,
      employment: (j.PositionSchedule || []).map(s => s.Name).join(' '), remote: /remote/i.test(j.PositionLocationDisplayName || ''),
      salary: j.PositionRemuneration?.[0] ? { min: +j.PositionRemuneration[0].MinimumRange, max: +j.PositionRemuneration[0].MaximumRange, currency: 'USD' } : null,
    }));
  } },
  reed: { needs: ['REED_KEY'], run: async () => {
    const out = [], auth = 'Basic ' + Buffer.from(`${env.REED_KEY}:`).toString('base64');
    for (const kw of ['software developer', 'software engineer', 'data engineer', 'data analyst', 'devops', 'it support', 'cyber security', 'frontend developer']) {
      const d = await getJSON(`https://www.reed.co.uk/api/1.0/search?keywords=${encodeURIComponent(kw)}&resultsToTake=100`, { headers: { authorization: auth } }).catch(() => null);
      out.push(...(d?.results || []).map(j => ({ source: 'reed', rawId: j.jobId, title: j.jobTitle, company: j.employerName, location: `${j.locationName || ''}, United Kingdom`,
        url: j.jobUrl, posted: j.date ? j.date.split('/').reverse().join('-') : null, text: j.jobDescription,
        salary: j.minimumSalary ? { min: j.minimumSalary, max: j.maximumSalary, currency: j.currency || 'GBP' } : null })));
    }
    return out;
  } },
};
export const enabledAggregators = () => Object.entries(AGG).filter(([, a]) => a.needs.every(k => env[k])).map(([k]) => k);

/* ---------------- live per-query search (cached 1 h) ---------------- */
const LIVE = new Map();
export async function liveSearch(q) {
  const key = String(q).toLowerCase().trim();
  if (!key) return [];
  const c = LIVE.get(key);
  if (c && Date.now() - c.t < 3600e3) return c.v;
  const [h, a] = await Promise.all([
    getJSON(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=20`, { ms: 20000 }).then(d => (d.jobs || []).map(himalaya)).catch(() => []),
    env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY ? getJSON(`https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}&results_per_page=30&what=${encodeURIComponent(q)}&content-type=application/json`, { ms: 20000 })
      .then(d => d.results.map(j => adzunaMap(j, 'in'))).catch(() => []) : [],
  ]);
  const rows = [...a.map(r => ({ ...r, sourceName: 'adzuna:in' })), ...h.map(r => ({ ...r, sourceName: 'himalayas' }))].map(r => toRow({ ...r, kind: 'aggregator' }));
  if (rows.length) await store.upsert(rows).catch(e => console.warn('[live upsert]', e.message));   // live finds join the store too
  LIVE.set(key, { t: Date.now(), v: rows });
  if (LIVE.size > 500) LIVE.delete(LIVE.keys().next().value);
  return rows;
}

export function toRow(raw) {
  const row = normalize(raw);
  return Object.assign(row, assess(row));
}

/* ---------------- the run ---------------- */
let running = null;
export const isCollecting = () => !!running;
export function collect({ sourcesFile = new URL('../sources.json', import.meta.url), concurrency = 10, only } = {}) {
  if (running) return running;
  running = (async () => {
    const cfg = JSON.parse(await fs.readFile(sourcesFile, 'utf8'));
    const tasks = [];
    for (const [category, byAts] of Object.entries(cfg.boards || {})) for (const [ats, list] of Object.entries(byAts)) for (const t of list)
      tasks.push({ name: `${ats}:${t}`, kind: 'ats', complete: true, category, source: ats, run: () => ATS[ats](t) });
    for (const b of cfg.open_boards || []) tasks.push({ name: b, kind: 'aggregator', source: b, run: OPEN[b] });
    for (const a of enabledAggregators()) tasks.push({ name: a, kind: 'aggregator', source: a, run: AGG[a].run });
    const list = only ? tasks.filter(t => only.includes(t.name)) : tasks;

    const runStart = new Date().toISOString(), t0 = Date.now(), sources = [], complete = [];
    let i = 0, total = 0;
    const worker = async () => {
      while (i < list.length) {
        const t = list[i++];
        try {
          const raws = await t.run();
          const rows = raws.filter(r => r.title).map(r => toRow({ ...r, source: r.source || t.source, sourceName: t.name, kind: t.kind, category: t.category }));
          const n = await store.upsert(rows);
          total += n; sources.push({ name: t.name, ok: true, count: n });
          if (process.env.COLLECT_VERBOSE) console.log(`[collect] ${t.name} ${n} (${sources.length}/${list.length})`);
          if (t.complete) complete.push(t.name);
        } catch (e) { sources.push({ name: t.name, ok: false, error: String(e.message || e).slice(0, 120) }); if (process.env.COLLECT_VERBOSE) console.log(`[collect] ${t.name} FAILED ${e.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
    await store.maintain({ completeSources: complete, runStart });
    const run = { startedAt: runStart, tookMs: Date.now() - t0, total, sources: sources.sort((a, b) => a.name.localeCompare(b.name)) };
    await store.recordRun(run);
    console.log(`[collect] ${total} postings from ${sources.filter(s => s.ok).length}/${sources.length} sources in ${run.tookMs}ms`);
    return run;
  })().finally(() => { running = null; });
  return running;
}
