import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, parseJSON } from '../lib/llm.mjs';

test('parseJSON tolerates prose and code fences around the JSON', () => {
  assert.deepEqual(parseJSON('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJSON('no json here'), /unreadable/);
});

test('validate coerces drifting model output into the UI shape', () => {
  const out = validate({
    exposure_score: '142', verdict: 42, evidence_quality: 'excellent',
    tasks: [{ task: 'Write code', category: 'AUTOMATE', exposure: 70.6, why: 'x' }, { task: '', category: 'human' }],
    future_roles: [{ title: 'AI engineer', fit: -5, gap: ['RAG', 3], evidence_ids: ['a'] }],
    skills_to_learn: ['RAG', { skill: 'Evals', reason: 'asked for' }],
    plan: [{ phase: 'Start', steps: ['one', '', 'two'] }],
  });
  assert.equal(out.exposure_score, 100);
  assert.equal(out.verdict, '42');
  assert.equal(out.evidence_quality, 'partial');
  assert.equal(out.tasks.length, 1);
  assert.equal(out.tasks[0].category, 'automate');
  assert.equal(out.tasks[0].exposure, 71);
  assert.equal(out.future_roles[0].fit, 0);
  assert.deepEqual(out.skills_to_learn[0], { skill: 'RAG', reason: '' });
  assert.deepEqual(out.plan[0].steps, ['one', 'two']);
  assert.equal(out.plan[0].days, 'Days 1-30');
});

test('validate rejects answers without tasks or plan', () => {
  assert.throws(() => validate({ tasks: [], plan: [] }), /incomplete/);
});
