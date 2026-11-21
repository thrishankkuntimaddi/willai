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
