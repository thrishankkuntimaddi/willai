import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, badge, linkMatchesCompany, HIDE_BELOW, FLAG_REASON } from '../lib/trust.mjs';

const post = (o = {}) => ({ title: 'Backend Engineer', company: 'Acme', source_kind: 'ats', url: 'https://boards.greenhouse.io/acme/1', seniority: 'mid',
  text: 'You will design and run the payment APIs that thousands of merchants rely on. We use Go, PostgreSQL and Kafka. You will work with product and design, review code, and take part in on-call. '.repeat(2), ...o });

test('a normal company posting keeps a high score', () => {
  const r = assess(post());
  assert.deepEqual(r.trust_flags, []);
  assert.ok(r.trust_score >= 90);
  assert.equal(badge(r.trust_score, 'ats').level, 'good');
});

test('fee requests are a strong red flag', () => {
  const r = assess(post({ source_kind: 'aggregator', text: 'Work from home data entry. Pay a refundable registration fee of Rs 2000 to confirm your seat. Contact on WhatsApp +91 98xxxxxx.' }));
  assert.ok(r.trust_flags.includes('fee') && r.trust_flags.includes('chat'));
  assert.ok(r.trust_score < HIDE_BELOW);
  assert.equal(badge(r.trust_score, 'aggregator').level, 'bad');
});

test('too-good-to-be-true pay and personal emails', () => {
  const r = assess(post({ source_kind: 'willai', company: 'Quick Jobs', url: 'https://bit.ly/abc', text: 'Earn ₹5000 per day typing from home! No interview. Send CV to hr.quickjobs@gmail.com' }));
  for (const f of ['too_good', 'free_mail', 'short_link']) assert.ok(r.trust_flags.includes(f), f);
  assert.equal(r.trust_score, 0);
});

test('every flag has a readable reason', () => {
  for (const f of ['fee', 'chat', 'too_good', 'free_mail', 'short_link', 'personal_data', 'vague', 'pay_outlier', 'link_mismatch', 'duplicate', 'reported']) assert.ok(FLAG_REASON[f], f);
});

test('user reports and duplicates lower the score', () => {
  const base = assess(post({ source_kind: 'aggregator' })).trust_score;
  assert.equal(assess(post({ source_kind: 'aggregator' }), { reports: 2 }).trust_score, base - 30);
  assert.equal(assess(post({ source_kind: 'aggregator' }), { duplicateCompanies: 3 }).trust_score, base - 20);
  assert.equal(assess(post({ source_kind: 'ats' }), { duplicateCompanies: 3 }).trust_flags.length, 0);   // company boards are not penalised
});

test('verified employers start higher; apply links must match the company', () => {
  assert.ok(assess(post({ source_kind: 'willai', url: 'https://acme.com/jobs/1' }), { verifiedEmployer: true }).trust_score > assess(post({ source_kind: 'willai', url: 'https://acme.com/jobs/1' })).trust_score);
  assert.ok(linkMatchesCompany('https://careers.acme.io/1', 'Acme Technologies Pvt Ltd'));
  assert.ok(linkMatchesCompany('https://jobs.lever.co/whatever', 'Acme'));
  assert.ok(!linkMatchesCompany('https://random-forms.site/apply', 'Acme'));
  assert.ok(assess(post({ source_kind: 'willai', url: 'https://random-forms.site/apply' })).trust_flags.includes('link_mismatch'));
});

test('pay outliers depend on seniority', () => {
  assert.ok(assess(post({ seniority: 'entry', salary_max: 6e6, salary_currency: 'INR' })).trust_flags.includes('pay_outlier'));
  assert.ok(!assess(post({ seniority: 'lead', salary_max: 6e6, salary_currency: 'INR' })).trust_flags.includes('pay_outlier'));
});
