// Employer postings and user reports. Postings go through the same normaliser and scam checks as collected jobs.
import crypto from 'node:crypto';
import { db, upsert } from './db.mjs';
import { toRow } from './collect.mjs';
import { shape } from './queries.mjs';
import { linkMatchesCompany, assess, HIDE_BELOW } from './trust.mjs';
import { cleanField } from './params.mjs';

const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|live|rediffmail|ymail|aol|proton|protonmail|icloud|gmx|mail)\./i;

// A verified employer signs in with a confirmed work email whose domain matches the company or its apply link.
export function verifiedEmployer(user, company, applyUrl) {
  if (!user?.email || !user.verified || FREE_MAIL.test(user.email)) return false;
  const domain = user.email.split('@')[1].toLowerCase();
  let host = '';
  try { host = new URL(applyUrl).hostname.toLowerCase(); } catch {}
  return host.endsWith(domain) || linkMatchesCompany(`https://${domain}`, company);
}

export function cleanPost(b) {
  const o = {
    title: cleanField(b.title, 120), company: cleanField(b.company, 120), location: cleanField(b.location, 120),
    type: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'].includes(b.type) ? b.type : 'Full-time',
    work_mode: ['remote', 'hybrid', 'onsite'].includes(b.work_mode) ? b.work_mode : b.remote ? 'remote' : 'onsite',
    salary: cleanField(b.salary, 80), description: String(b.description ?? '').replace(/[<>]/g, '').trim().slice(0, 6000), applyUrl: cleanField(b.applyUrl, 500),
  };
  if (o.title.length < 2 || !o.company || o.description.length < 80) throw Object.assign(new Error('Add a title, the company and a description of at least a few lines.'), { status: 400 });
  if (!/^(https:\/\/|mailto:)/i.test(o.applyUrl)) throw Object.assign(new Error('The apply link must start with https:// or mailto:'), { status: 400 });
  return o;
}

export async function createPost(user, body) {
  const o = cleanPost(body);
  const [{ n }] = await db().q(`select count(*)::int as n from postings where owner_uid = $1 and first_seen > now() - interval '1 day'`, [user.uid]);
  if (n >= 10) throw Object.assign(new Error('You can post up to 10 roles a day.'), { status: 429 });
  const verified = verifiedEmployer(user, o.company, o.applyUrl);
  const row = toRow({ source: 'willai', sourceName: 'willai', kind: 'willai', rawId: crypto.randomUUID(), title: o.title, company: o.company, location: o.location,
    url: o.applyUrl, posted: Date.now(), remote: o.work_mode === 'remote', hybrid: o.work_mode === 'hybrid', employment: o.type,
    text: `${o.description}${o.salary ? `\nPay: ${o.salary}` : ''}` });
  Object.assign(row, assess(row, { verifiedEmployer: verified }), { owner_uid: user.uid, work_mode: o.work_mode });
  await upsert([row]);
  return { id: row.id, verified, trust: row.trust_score, flags: row.trust_flags, hidden: row.trust_score < HIDE_BELOW };
}

export async function myPosts(uid) {
  return (await db().q(`select id, title, company, company_category, location_raw, cities, countries, url, posted_at, first_seen, status, work_mode, seniority, role_family,
    employment_type, salary_min, salary_max, salary_currency, skills, ai, source, source_kind, trust_score, trust_flags, left(text, 240) as snippet, reports
    from postings where owner_uid = $1 order by first_seen desc limit 100`, [uid])).map(r => ({ ...shape(r), reports: r.reports }));
}
export async function setPostStatus(uid, id, status) {
  if (!['active', 'closed'].includes(status)) throw Object.assign(new Error('Bad status'), { status: 400 });
  const r = await db().q(`update postings set status = $3, closed_at = case when $3 = 'closed' then now() else null end, last_seen = now()
    where id = $1 and owner_uid = $2 returning id`, [id, uid, status]);
  if (!r.length) throw Object.assign(new Error('Not your posting.'), { status: 404 });
}
export async function deletePost(uid, id) {
  const r = await db().q(`delete from postings where id = $1 and owner_uid = $2 and source_kind = 'willai' returning id`, [id, uid]);
  if (!r.length) throw Object.assign(new Error('Not your posting.'), { status: 404 });
}

const REPORT_REASONS = ['Asks me to pay money', 'Company looks fake', 'Details are misleading', 'Job does not exist any more', 'Spam or duplicate', 'Something else'];
export async function reportJob(uid, b) {
  const id = cleanField(b.id, 300), reason = REPORT_REASONS.includes(b.reason) ? b.reason : 'Something else';
  const ins = await db().q(`insert into job_reports (job_id, uid, reason, note) select $1, $2, $3, $4 where exists (select 1 from postings where id = $1)
    on conflict (job_id, uid) do nothing returning job_id`, [id, uid, reason, cleanField(b.note, 500)]);
  if (ins.length) await db().q(`update postings set reports = reports + 1, trust_score = greatest(0, trust_score - 15),
    trust_flags = case when 'reported' = any(trust_flags) then trust_flags else array_append(trust_flags, 'reported') end where id = $1`, [id]);
  return { ok: true, counted: ins.length > 0 };
}
