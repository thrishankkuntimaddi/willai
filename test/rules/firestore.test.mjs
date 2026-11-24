// Firestore security rules, run against the emulator: npm run test:rules (needs Java; CI installs it).
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

const HAS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
let env;
before(async () => {
  if (!HAS_EMULATOR) return;
  env = await initializeTestEnvironment({ projectId: 'willai-rules-test', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { if (env) await env.clearFirestore(); });

const t = (name, fn) => test(name, { skip: !HAS_EMULATOR && 'Firestore emulator not running (npm run test:rules)' }, fn);
const as = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const user = (o = {}) => ({ role: 'seeker', name: 'Asha', email: 'asha@example.com', company: '', createdAt: serverTimestamp(), ...o });

t('people can only read and write their own account', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), user()));
  await assertFails(getDoc(doc(as('bob'), 'users/alice')));
  await assertFails(setDoc(doc(as('bob'), 'users/alice'), user()));
  await assertFails(getDoc(doc(as(null), 'users/alice')));
});

t('account fields are validated', async () => {
  await assertFails(setDoc(doc(as('alice'), 'users/alice'), user({ role: 'admin' })));
  await assertFails(setDoc(doc(as('alice'), 'users/alice'), user({ isAdmin: true })));
  await assertFails(setDoc(doc(as('alice'), 'users/alice'), user({ name: 'x'.repeat(200) })));
});

t('reports are private and only progress can change', async () => {
  const db = as('alice');
  await setDoc(doc(db, 'users/alice'), user());
  const ref = await assertSucceeds(addDoc(collection(db, 'users/alice/reports'), { profile: { role: 'Dev' }, result: { exposure_score: 40 }, done: [], createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { done: ['0.1'] }));
  await assertFails(updateDoc(ref, { result: { exposure_score: 1 } }));
  await assertFails(getDoc(doc(as('bob'), ref.path)));
});

t('saved jobs are private', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/saved_jobs/j1'), { title: 'Dev', company: 'Acme', url: 'https://x.co', location: '', source: 'greenhouse', posted: null, savedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(as('bob'), 'users/alice/saved_jobs/j1')));
});

t('career profile and prefs are shape-checked', async () => {
  const db = as('alice');
  await assertSucceeds(setDoc(doc(db, 'users/alice'), user({ career: { status: 'fresher', skills: [{ name: 'React', level: 2 }], target: 'Frontend developer', planDays: 30, budget: 'free' }, prefs: { defaultPlanDays: 60, shareByDefault: false } })));
  await assertFails(setDoc(doc(db, 'users/alice'), user({ career: { status: 'astronaut' } })));
  await assertFails(setDoc(doc(db, 'users/alice'), user({ career: { skills: Array(41).fill('x') } })));
  await assertFails(setDoc(doc(db, 'users/alice'), user({ career: { planDays: 9999 } })));
  await assertFails(setDoc(doc(db, 'users/alice'), user({ prefs: { isAdmin: true } })));
});

t('feedback is write-once and private to its author', async () => {
  const fb = { uid: 'alice', rating: 4, chips: ['Plan is useful'], text: 'nice', reportId: null, page: 'report', createdAt: serverTimestamp() };
  const ref = await assertSucceeds(addDoc(collection(as('alice'), 'feedback'), fb));
  await assertFails(addDoc(collection(as('bob'), 'feedback'), fb));                    // cannot write as someone else
  await assertFails(addDoc(collection(as(null), 'feedback'), fb));
  await assertFails(addDoc(collection(as('alice'), 'feedback'), { ...fb, rating: 9 }));
  await assertFails(getDoc(doc(as('bob'), ref.path)));
  await assertFails(updateDoc(doc(as('alice'), ref.path), { rating: 1 }));
});

t('shared reports: public to read, only allow-listed fields, only the owner writes', async () => {
  const card = { ownerUid: 'alice', role: 'QA engineer', status: 'working', yearsBand: '3–5 yrs', country: 'India', city: 'Pune', target: 'SDET', family: '',
    exposure: 40, readiness: 43, nearOpenings: 0, tasks: [], roles: [], planDays: 60, phases: [], takeaways: [], rating: 5, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('alice'), 'shared_reports/alice_r1'), card));
  await assertSucceeds(getDoc(doc(as(null), 'shared_reports/alice_r1')));
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r2'), { ...card, email: 'alice@example.com' }));
  await assertFails(setDoc(doc(as('bob'), 'shared_reports/alice_r3'), { ...card, ownerUid: 'bob' }));   // id must start with your uid
  // numbers are drawn into the page, so they must be numbers in range; dates come from the server clock
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, exposure: '<b>99</b>' }));
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, readiness: 250 }));
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, planDays: 'forever' }));
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, status: 'ceo' }));
  await assertFails(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, createdAt: new Date('2999-01-01') }));
  await assertSucceeds(setDoc(doc(as('alice'), 'shared_reports/alice_r4'), { ...card, readiness: null, nearOpenings: null }));
  await assertFails(deleteDoc(doc(as('bob'), 'shared_reports/alice_r1')));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'shared_reports/alice_r1')));
});

t('job postings can no longer be created from the browser', async () => {
  await setDoc(doc(as('emp'), 'users/emp'), user({ role: 'employer', company: 'Acme' }));
  await assertFails(addDoc(collection(as('emp'), 'jobs'), { ownerUid: 'emp', title: 'Dev', company: 'Acme', location: '', remote: false, type: 'Full-time', salary: '', description: 'x'.repeat(20), applyUrl: 'https://acme.com', status: 'open', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});
