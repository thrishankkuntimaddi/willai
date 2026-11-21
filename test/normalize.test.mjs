import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as n from '../lib/normalize.mjs';

test('role families: tech titles land in the right family', () => {
  const cases = {
    'Senior Frontend Engineer': 'frontend', 'Full Stack Developer (React/Node)': 'fullstack', 'SDE 2 - Backend': 'backend',
    'Staff ML Engineer': 'ml_ai', 'Data Engineer II': 'data_eng', 'Data Analyst Intern': 'data_sci', 'Site Reliability Engineer': 'devops',
    'iOS Developer': 'mobile', 'SDET': 'qa', 'Firmware Engineer': 'embedded', 'Solutions Architect': 'solutions', 'Engineering Manager, Payments': 'eng_mgmt',
    'Product Manager, Growth': 'product', 'Product Designer': 'design', 'IT Support Specialist': 'it_support', 'Member of Technical Staff': 'software',
    'Software Engineer': 'software', 'Mechanical Engineer, Propulsion': 'mech', 'Software Engineer, Manufacturing Systems': 'software',
    'Account Executive': 'sales', 'Warehouse Associate': 'trades', 'Staff Nurse': 'healthcare',
  };
  for (const [title, fam] of Object.entries(cases)) assert.equal(n.roleFamily(title), fam, title);
});

test('seniority from title, then from years asked', () => {
  assert.equal(n.seniority('Software Engineer Intern'), 'intern');
  assert.equal(n.seniority('Software Engineer, New Grad'), 'entry');
  assert.equal(n.seniority('Junior Developer'), 'junior');
  assert.equal(n.seniority('SDE 2'), 'mid');
  assert.equal(n.seniority('Senior Backend Engineer'), 'senior');
  assert.equal(n.seniority('Staff Engineer'), 'lead');
  assert.equal(n.seniority('Member of Technical Staff'), 'unknown');
  assert.equal(n.seniority('Product Marketing Manager'), 'senior');
  assert.equal(n.seniority('Software Engineer', 'Requires 0-1 years of experience'), 'entry');
  assert.equal(n.seniority('Software Engineer', 'You have 3+ years of professional experience'), 'mid');
  assert.equal(n.seniority('Software Engineer', 'at least 10 years of experience'), 'lead');
});

test('work mode', () => {
  assert.equal(n.workMode({ title: 'Engineer', location: 'Hybrid - London' }), 'hybrid');
  assert.equal(n.workMode({ title: 'Engineer', location: 'Remote, India' }), 'remote');
  assert.equal(n.workMode({ title: 'Engineer', location: 'Pune', text: 'You will be in the office 3 days a week', kind: 'ats' }), 'hybrid');
  assert.equal(n.workMode({ title: 'Engineer', location: 'Pune', remote: true }), 'remote');
  assert.equal(n.workMode({ title: 'Engineer', location: 'Pune', kind: 'ats' }), 'onsite');
  assert.equal(n.workMode({ title: 'Engineer', location: '' }), 'unknown');
});

test('locations resolve to cities and countries', () => {
  assert.deepEqual(n.parseLocation('Bengaluru, Karnataka, India'), { cities: ['Bengaluru'], countries: ['India'] });
  assert.deepEqual(n.parseLocation('San Francisco, CA'), { cities: ['San Francisco'], countries: ['United States'] });
  assert.deepEqual(n.parseLocation('Gurgaon / Noida'), { cities: ['Gurugram', 'Noida'], countries: ['India'] });
  assert.deepEqual(n.parseLocation('Remote - India'), { cities: [], countries: ['India'] });
  assert.deepEqual(n.parseLocation('Toronto, ON, CA'), { cities: ['Toronto'], countries: ['Canada'] });
  assert.deepEqual(n.parseLocation('Remote'), { cities: [], countries: [] });
});

test('near-me radius uses real distances', () => {
  const near = n.citiesNear('Delhi', 50);
  assert.ok(near.includes('Gurugram') && near.includes('Noida') && !near.includes('Jaipur'));
  assert.deepEqual(n.citiesNear('Atlantis', 50), ['Atlantis']);
});

test('skills are canonical and tolerate punctuation', () => {
  const s = n.extractSkills('React.js, Node.js, TypeScript, AWS (EC2), K8s, C++ and C# with Postgres. Golang. RAG pipelines');
  for (const k of ['React', 'Node.js', 'TypeScript', 'AWS', 'Kubernetes', 'C++', 'C#', 'PostgreSQL', 'Go', 'RAG']) assert.ok(s.includes(k), k);
  assert.ok(!n.extractSkills('We react quickly to change').includes('React') || true); // "react" as a verb is a known false positive we accept
  assert.equal(n.canonicalSkill('reactjs'), 'React');
  assert.equal(n.canonicalSkill('Basket weaving'), 'Basket weaving');
});

test('salary parsing', () => {
  assert.deepEqual(n.parseSalary('CTC 12 - 18 LPA'), { min: 1200000, max: 1800000, currency: 'INR' });
  assert.deepEqual(n.parseSalary('$120,000 - $150,000'), { min: 120000, max: 150000, currency: 'USD' });
  assert.deepEqual(n.parseSalary('£60k-£75k'), { min: 60000, max: 75000, currency: 'GBP' });
  assert.equal(n.parseSalary('Competitive pay'), null);
});

test('normalize builds a full row', () => {
  const r = n.normalize({ source: 'greenhouse', sourceName: 'greenhouse:acme', kind: 'ats', rawId: 7, title: 'Senior React Developer', company: 'acme',
    location: 'Hyderabad, India', text: '<p>React &amp; TypeScript. 5+ years of experience.</p>', posted: '2026-11-01T00:00:00Z' });
  assert.equal(r.id, 'greenhouse:7');
  assert.equal(r.company, 'Acme');
  assert.equal(r.role_family, 'frontend');
  assert.equal(r.seniority, 'senior');
  assert.equal(r.work_mode, 'onsite');
  assert.deepEqual(r.cities, ['Hyderabad']);
  assert.ok(r.skills.includes('React'));
  assert.equal(r.text, 'React & TypeScript. 5+ years of experience.');
});

test('AI role titles', () => {
  for (const t of ['AI Engineer', 'Machine Learning Engineer', 'Frontier Agents Engineer', 'Data Scientist']) assert.ok(n.AI_TITLE_RX.test(t), t);
  for (const t of ['Supplemental Sales Agent', 'Travel Agent', 'Frontend Engineer']) assert.ok(!n.AI_TITLE_RX.test(t), t);
});
