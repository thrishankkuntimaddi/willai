import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, parseJSON } from '../lib/llm.mjs';

test('parseJSON tolerates prose and code fences around the JSON', () => {
  assert.deepEqual(parseJSON('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJSON('no json here'), /unreadable/);
});

test('validate coerces drifting model output into the UI shape', () => {
  const out = validate({
    headline: 42, evidence_quality: 'excellent', exposure_2030: '142',
    tasks: [{ task: 'Write code', category: 'AUTOMATE', exposure: 70.6, why: 'old field' }, { task: '', category: 'human' }],
    human_edge: ['Talking to users'],
    future_roles: [{ title: 'AI engineer', fit: -5, gap: ['RAG', 3], evidence_ids: ['a'] }],
    skills_to_learn: ['RAG', { skill: 'Evals', reason: 'asked for', hours: 40 }],
    skill_map: [{ skill: 'React', status: 'expert' }],
    plan: [{ phase: 'Start', steps: ['one', '', 'two'] }],
  });
  assert.equal(out.headline, '42');
  assert.equal(out.exposure_2030, 100);
  assert.equal(out.evidence_quality, 'partial');
  assert.equal(out.tasks.length, 1);
  assert.equal(out.tasks[0].category, 'automate');
  assert.equal(out.tasks[0].exposure, 71);
  assert.equal(out.tasks[0].detail, 'old field');
  assert.deepEqual(out.human_edge[0], { headline: 'Talking to users', detail: '' });
  assert.equal(out.future_roles[0].fit, 0);
  assert.deepEqual(out.skills_to_learn[0], { skill: 'RAG', reason: '', hours: 0 });
  assert.equal(out.skill_map[0].status, 'missing');
  assert.deepEqual(out.plan[0].steps.map(s => s.action), ['one', 'two']);
  assert.equal(out.plan[0].goal, 'Start');
});

test('validate rejects answers without tasks or plan', () => {
  assert.throws(() => validate({ tasks: [], plan: [] }), /incomplete/);
});
