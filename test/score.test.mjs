import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposureScore, readinessScore, phasesFor, safeResource } from '../lib/score.mjs';
import { validate } from '../lib/llm.mjs';
import { cleanProfile } from '../lib/params.mjs';
import { subjectOf } from '../lib/advise.mjs';

test('exposure is the time-weighted average and the table adds up', () => {
  const s = exposureScore([
    { task: 'Boilerplate UI', share_of_week: 40, exposure: 80 },
    { task: 'Debugging', share_of_week: 30, exposure: 30 },
    { task: 'Working with designers', share_of_week: 30, exposure: 10 },
  ]);
  assert.equal(s.value, 44);                                   // .4*80 + .3*30 + .3*10
  assert.equal(Math.round(s.rows.reduce((a, r) => a + r.contribution, 0)), s.value);
});

test('exposure falls back to equal weights when shares are missing', () => {
  assert.equal(exposureScore([{ task: 'a', exposure: 60 }, { task: 'b', exposure: 20 }]).value, 40);
});

test('readiness weights skills by how often employers ask for them', () => {
  const demanded = [{ k: 'React', share: 0.6 }, { k: 'TypeScript', share: 0.3 }, { k: 'GraphQL', share: 0.1 }, { k: 'Rare', share: 0.01 }];
  const r = readinessScore(demanded, [{ name: 'reactjs', level: 3 }, { name: 'TypeScript', level: 1 }], [{ skill: 'GraphQL', status: 'missing' }]);
  assert.equal(r.rows.length, 3, 'skills asked in under 3% of postings are ignored');
  assert.equal(r.value, 75);                                   // 60*1 + 30*0.5 + 10*0
  assert.equal(r.rows.find(x => x.skill === 'React').source, 'you');
  const inferred = readinessScore(demanded, [], [{ skill: 'React', status: 'has' }]);
  assert.equal(inferred.rows.find(x => x.skill === 'React').source, 'inferred');
  assert.equal(readinessScore([], []).value, null);
});

test('plan phases follow the chosen length', () => {
  assert.deepEqual(phasesFor(30).map(p => p.label), ['Days 1–7', 'Days 8–14', 'Days 15–21', 'Days 22–30']);
  assert.equal(phasesFor(60).length, 4);
  assert.deepEqual(phasesFor(90).map(p => p.label), ['Days 1–30', 'Days 31–60', 'Days 61–90']);
  assert.equal(phasesFor(180).length, 6);
  assert.equal(phasesFor(365).length, 6);
  assert.equal(phasesFor(365).at(-1).to, 365);
  assert.equal(phasesFor(3)[0].to, 7);
});

test('resources only link straight to known learning sites', () => {
  assert.equal(safeResource({ title: 'React docs', provider: 'React', url: 'https://react.dev/learn' }).direct, true);
  const odd = safeResource({ title: 'Course', provider: 'X', url: 'https://totally-real-course.biz/free' });
  assert.equal(odd.direct, false);
  assert.match(odd.url, /^https:\/\/www\.google\.com\/search\?q=Course%20X$/);
  assert.equal(safeResource({ title: 'Evil', url: 'javascript:alert(1)' }).direct, false);
});

test('validate makes the plan match the requested phases', () => {
  const phases = phasesFor(30);
  const out = validate({
    headline: 'one two three', takeaways: ['a', 'b', 'c', 'd'],
    tasks: [{ task: 'Write UI', short: 'Writing UI code fast', share_of_week: 50, exposure: 70, category: 'automate' }],
    plan: [{ days: 'Week 1', goal: 'g', steps: [{ action: 'x', hours: 5, resources: [{ title: 't' }] }] }, { days: 'whatever', steps: ['y'] }],
  }, { phases });
  assert.equal(out.version, 2);
  assert.equal(out.takeaways.length, 3);
  assert.equal(out.tasks[0].short, 'Writing UI code');
  assert.deepEqual(out.plan.map(p => p.days), ['Days 1–7', 'Days 8–14']);
  assert.equal(out.plan[1].steps[0].action, 'y');
});

test('profiles are cleaned, and v1 forms still work', () => {
  const p = cleanProfile({ status: 'fresher', target: 'Frontend developer', skills: [{ name: 'React', level: 9 }, 'CSS', { name: '' }], workModes: ['hybrid', 'moon'], planDays: 9999, weeklyHours: 'x' });
  assert.deepEqual(p.skills, [{ name: 'React', level: 2 }, { name: 'CSS', level: 2 }]);
  assert.deepEqual(p.workModes, ['hybrid']);
  assert.equal(p.planDays, 365);
  assert.equal(p.weeklyHours, 8);
  assert.equal(subjectOf(p), 'target');
  const v1 = cleanProfile({ role: 'Staff Nurse', years: '6', skills: 'ICU care, charts', country: 'India (Hyderabad)', education: 'BSc Nursing' });
  assert.equal(v1.dailyWork, 'ICU care, charts');
  assert.equal(v1.country, 'India');
  assert.deepEqual(v1.locations, ['Hyderabad']);
  assert.equal(v1.education[0].degree, 'BSc Nursing');
  assert.equal(subjectOf(v1), 'current');
});
