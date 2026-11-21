// Storage + queries against an in-memory Postgres (PGlite), no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../lib/db.mjs';
import * as Q from '../lib/queries.mjs';
import { toRow } from '../lib/collect.mjs';
import { filtersFrom } from '../lib/params.mjs';

const day = 864e5;
const long = s => `${s} `.repeat(30);
const raw = (id, o = {}) => ({ source: 'greenhouse', sourceName: 'greenhouse:acme', kind: 'ats', category: 'Fintech & payments', rawId: id, company: 'acme',
  title: 'Backend Engineer', location: 'Bengaluru, India', text: long(`Build payment APIs in Go and PostgreSQL. Role ${id}.`), posted: Date.now() - day, ...o });

before(async () => {
  await store.open(undefined, { dataDir: 'memory://' });
  await store.upsert([
    raw(1, { title: 'Senior React Developer', text: long('React and TypeScript, hybrid, 3 days a week in office.') }),
    raw(2, { title: 'Software Engineer, New Grad', location: 'Gurgaon, India' }),
    raw(3, { title: 'Data Engineer', location: 'Remote - India', text: long('Spark, Airflow and dbt') }),
    raw(4, { title: 'Backend Engineer', location: 'London, UK', posted: Date.now() - 200 * day }),
    raw(5, { source: 'jooble', sourceName: 'jooble', kind: 'aggregator', company: 'Fast Hire', title: 'Data Entry Operator', location: 'Hyderabad',
      text: 'Work from home. Pay a registration fee of Rs 500 to start. Contact on WhatsApp.' }),
    raw(6, { title: 'Account Executive', location: 'Mumbai, India' }),
  ].map(toRow));
});
after(() => store.close());

test('upsert stores normalised rows and marks old ones stale', async () => {
  const rows = await store.db().q('select id, status, role_family, work_mode, cities from postings order by id');
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by['greenhouse:1'].role_family, 'frontend');
  assert.equal(by['greenhouse:1'].work_mode, 'hybrid');
  assert.deepEqual(by['greenhouse:2'].cities, ['Gurugram']);
  assert.equal(by['greenhouse:4'].status, 'stale');
  assert.equal(by['jooble:5'].status, 'active');
});

test('scams are hidden by default and shown on request', async () => {
  const all = await Q.search({ q: 'data entry' });
  assert.equal(all.total, 0);
  const flagged = await Q.search({ q: 'data entry', showFlagged: true });
  assert.equal(flagged.total, 1);
  assert.equal(flagged.items[0].trust.level, 'bad');
  assert.ok(flagged.items[0].trust.reasons.some(r => /fee/.test(r)));
});

test('filters: tech only, place with radius, seniority, work mode', async () => {
  const tech = await Q.search({ tech: true });
  assert.ok(!tech.items.some(i => i.family === 'sales'));
  const delhi = await Q.search({ city: 'Delhi', radius: 50 });
  assert.deepEqual(delhi.items.map(i => i.id), ['greenhouse:2']);
  const remoteIndia = await Q.search({ city: 'Pune', radius: 25, countries: ['India'] });
  assert.ok(remoteIndia.items.some(i => i.id === 'greenhouse:3'), 'remote roles open to the country count as near');
  const fresh = await Q.search({ seniority: ['entry'] });
  assert.deepEqual(fresh.items.map(i => i.id), ['greenhouse:2']);
  const hybrid = await Q.search({ mode: ['hybrid'] });
  assert.deepEqual(hybrid.items.map(i => i.id), ['greenhouse:1']);
  const old = await Q.search({ q: 'backend', includeOld: true });
  assert.ok(old.items.some(i => i.status === 'stale'));
});

test('keyword search matches titles and skills, not stray body words', async () => {
  const r = await Q.search({ q: 'react developer' });
  assert.equal(r.items[0].id, 'greenhouse:1');
  const spark = await Q.search({ q: 'spark' });
  assert.deepEqual(spark.items.map(i => i.id), ['greenhouse:3']);
});

test('facets count each dimension with the other filters applied', async () => {
  const f = await Q.facets({ mode: ['hybrid'] });
  assert.ok(f.mode.find(m => m.k === 'onsite'), 'other modes still listed so the user can switch');
  assert.ok(f.family.every(x => x.label));
  assert.ok(f.city.length > 0);
});

test('closing: postings missing from a complete source are archived, never deleted', async () => {
  const runStart = new Date().toISOString();
  await new Promise(r => setTimeout(r, 20));
  await store.upsert([toRow(raw(1, { title: 'Senior React Developer', text: long('React and TypeScript, hybrid, 3 days a week in office.') }))]);
  await store.maintain({ completeSources: ['greenhouse:acme'], runStart });
  const rows = await store.db().q(`select id, status from postings where source_name = 'greenhouse:acme' order by id`);
  assert.equal(rows.find(r => r.id === 'greenhouse:1').status, 'active');
  assert.equal(rows.find(r => r.id === 'greenhouse:2').status, 'closed');
  assert.equal(rows.length, 5, 'nothing deleted');
});

test('duplicate text under different companies is flagged for aggregator posts', async () => {
  const t = long('Exactly the same copy pasted job text about a support role with great growth.');
  await store.upsert([toRow(raw('d1', { source: 'jooble', sourceName: 'jooble', kind: 'aggregator', company: 'Alpha', title: 'Support Engineer', text: t })),
    toRow(raw('d2', { source: 'jooble', sourceName: 'jooble', kind: 'aggregator', company: 'Beta', title: 'Support Engineer', text: t }))]);
  await store.maintain({ runStart: new Date().toISOString() });
  const rows = await store.db().q(`select trust_flags from postings where id in ('jooble:d1', 'jooble:d2')`);
  assert.ok(rows.every(r => r.trust_flags.includes('duplicate')));
});

test('query-string filters are validated', () => {
  const f = filtersFrom(new URLSearchParams('q=react&family=frontend,evil&mode=hybrid&days=7&city=Pune&radius=9999&remote=1'));
  assert.deepEqual(f.family, ['frontend']);
  assert.deepEqual(f.mode, ['hybrid']);
  assert.equal(f.days, 7);
  assert.equal(f.radius, 500);
  assert.equal(filtersFrom(new URLSearchParams('remote=1')).mode[0], 'remote');
});

test('trends, market and suggestions', async () => {
  Q.clearCache();
  const t = await Q.trends();
  assert.ok(t.total > 0 && t.families.length > 0);
  const m = await Q.market('react developer');
  assert.equal(m.count, 1);
  assert.equal(m.skills.find(s => s.k === 'React').share, 1);
  const s = await Q.suggest('react');
  assert.equal(s[0].k, 'react developer');
});
