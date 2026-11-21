// Database access. Production: Postgres (Supabase) via DATABASE_URL. Without it: embedded PGlite (local dev, tests).
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const SCHEMA = new URL('../db/schema.sql', import.meta.url);
let DB = null;

export async function open(url = process.env.DATABASE_URL, { dataDir } = {}) {
  if (DB) return DB;
  if (url) {
    const { default: postgres } = await import('postgres');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // prepare:false keeps it compatible with Supabase's transaction pooler (port 6543)
    const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 20, prepare: false, ssl: local ? false : 'require', onnotice: () => {} });
    DB = { kind: 'postgres', q: (text, params = []) => sql.unsafe(text, params), exec: text => sql.unsafe(text), close: () => sql.end() };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(dataDir ?? process.env.PGLITE_DIR ?? './cache/pg');
    DB = { kind: 'pglite', q: async (text, params = []) => (await pg.query(text, params)).rows, exec: text => pg.exec(text), close: () => pg.close() };
  }
  await DB.exec(await fs.readFile(SCHEMA, 'utf8'));
  return DB;
}
export const db = () => { if (!DB) throw new Error('database not opened'); return DB; };
export async function close() { if (DB) { const d = DB; DB = null; await d.close(); } }

const COLS = [
  ['id', 'text'], ['source', 'text'], ['source_name', 'text'], ['source_kind', 'text'], ['company', 'text'], ['company_category', 'text'],
  ['title', 'text'], ['norm_title', 'text'], ['role_family', 'text'], ['seniority', 'text'], ['employment_type', 'text'], ['work_mode', 'text'],
  ['cities', 'text[]'], ['countries', 'text[]'], ['location_raw', 'text'], ['dept', 'text'], ['salary_min', 'double precision'], ['salary_max', 'double precision'],
  ['salary_currency', 'text'], ['skills', 'text[]'], ['tags', 'text[]'], ['text', 'text'], ['text_hash', 'text'], ['url', 'text'], ['posted_at', 'timestamptz'],
  ['ai', 'boolean'], ['ai_title', 'boolean'], ['trust_score', 'integer'], ['trust_flags', 'text[]'], ['owner_uid', 'text'],
];
const UPDATABLE = COLS.map(([c]) => c).filter(c => !['id', 'owner_uid', 'trust_score'].includes(c));
const UPSERT = `insert into postings (${COLS.map(c => c[0]).join(', ')}, last_seen, status, closed_at)
  select ${COLS.map(c => 'x.' + c[0]).join(', ')}, now(),
    case when coalesce(x.posted_at, now()) < now() - (case when x.source_kind = 'ats' then interval '120 days' else interval '45 days' end) then 'stale' else 'active' end, null
  from jsonb_to_recordset($1::text::jsonb) as x(${COLS.map(([c, t]) => `${c} ${t}`).join(', ')})
  on conflict (id) do update set ${UPDATABLE.map(c => `${c} = excluded.${c}`).join(', ')},
    last_seen = now(), closed_at = null,
    status = case when coalesce(excluded.posted_at, postings.first_seen) < now() - (case when excluded.source_kind = 'ats' then interval '120 days' else interval '45 days' end) then 'stale' else 'active' end,
    trust_score = greatest(0, excluded.trust_score - least(45, postings.reports * 15))`;

export const textHash = t => (t && t.length >= 300 ? crypto.createHash('md5').update(t.toLowerCase().replace(/\s+/g, ' ').slice(0, 600)).digest('hex') : null);

// Writes go one at a time: a small hosted database handles a steady stream far better than ten writers rebuilding search indexes at once.
let writing = Promise.resolve();
export function upsert(rows) {
  const run = writing.then(() => upsertNow(rows));
  writing = run.catch(() => {});
  return run;
}
async function upsertNow(rows) {
  const seen = new Map();
  for (const r of rows) seen.set(r.id, r);          // last one wins inside a batch
  const list = [...seen.values()];
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400).map(r => ({ ...r, text_hash: r.text_hash ?? textHash(r.text) }));
    await db().q(UPSERT, [JSON.stringify(chunk)]);
  }
  return list.length;
}

// After a collection run: archive (never delete) what disappeared, mark old postings stale, flag copy-paste scams.
export async function maintain({ completeSources = [], runStart }) {
  const q = db().q;
  if (completeSources.length) await q(`update postings set status = 'closed', closed_at = now()
    where source_name = any(array(select jsonb_array_elements_text($1::text::jsonb))) and status <> 'closed' and last_seen < $2::timestamptz`, [JSON.stringify(completeSources), runStart]);
  await q(`update postings set status = 'closed', closed_at = now() where source_kind = 'aggregator' and status <> 'closed' and last_seen < now() - interval '10 days'`);
  await q(`update postings set status = 'stale' where status = 'active' and source_kind <> 'willai'
    and coalesce(posted_at, first_seen) < now() - (case when source_kind = 'ats' then interval '120 days' else interval '45 days' end)`);
  await q(`update postings set text = left(text, 300) where status = 'closed' and closed_at < now() - interval '90 days' and length(text) > 300`);
  await q(`with d as (select text_hash from postings where status = 'active' and text_hash is not null group by text_hash having count(distinct lower(company)) > 1)
    update postings set trust_score = greatest(0, trust_score - 20), trust_flags = array_append(trust_flags, 'duplicate')
    where text_hash in (select text_hash from d) and source_kind <> 'ats' and not ('duplicate' = any(trust_flags))`);
}

export async function recordRun(run) {
  await db().q('insert into collect_runs (started_at, took_ms, total, sources) values ($1::timestamptz, $2, $3, $4::text::jsonb)', [run.startedAt, run.tookMs, run.total, JSON.stringify(run.sources)]);
  await db().q('delete from collect_runs where id not in (select id from collect_runs order by id desc limit 50)');
}
export async function lastRun() {
  const [r] = await db().q('select started_at, took_ms, total, sources from collect_runs order by id desc limit 1');
  return r || null;
}
export async function sizeInfo() {
  const [r] = await db().q(`select count(*)::int as total, count(*) filter (where status = 'active')::int as active,
    count(*) filter (where status = 'stale')::int as stale, count(*) filter (where status = 'closed')::int as closed,
    pg_database_size(current_database())::bigint as bytes from postings`);
  return { ...r, bytes: Number(r.bytes) };
}
