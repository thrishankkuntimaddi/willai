// Firebase: auth (Google + email) and Firestore for reports, saved jobs and employer postings.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

const app = initializeApp(window.WILLAI.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

let current = null, profile = null, ready = false, pending = { role: 'seeker', company: '' };
const subs = new Set();
const emit = () => subs.forEach(f => f(current, profile));

onAuthStateChanged(auth, async u => {
  current = u;
  try { profile = u ? await ensureProfile(u) : null; } catch (e) { console.error(e); profile = null; }
  ready = true; emit();
});

async function ensureProfile(u) {
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const p = { role: pending.role, name: u.displayName || '', email: u.email || '', company: pending.company || '', createdAt: serverTimestamp() };
  await setDoc(ref, p);
  return p;
}

export const onUser = f => { subs.add(f); if (ready) f(current, profile); return () => subs.delete(f); };
export const user = () => current;
export const userProfile = () => profile;
export const isReady = () => ready;
export const token = async () => (current ? current.getIdToken() : null);

/* ---------- auth ---------- */
const friendly = e => ({
  'auth/invalid-credential': 'Email or password is wrong.', 'auth/wrong-password': 'Email or password is wrong.',
  'auth/user-not-found': 'No account with that email.', 'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters for the password.', 'auth/invalid-email': 'That email address looks wrong.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.', 'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/unauthorized-domain': 'This website address is not authorised for sign-in yet.',
}[e.code] || 'Sign-in failed. Please try again.');
const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); throw new Error(e.code?.startsWith('auth/') ? friendly(e) : (e.message || 'Something went wrong.')); } };

export const signInGoogle = wrap(async (role = 'seeker', company = '') => { pending = { role, company }; await signInWithPopup(auth, new GoogleAuthProvider()); });
export const signUpEmail = wrap(async ({ name, email, password, role, company }) => {
  pending = { role, company };
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, 'users', cred.user.uid), { role, name: name || '', email, company: company || '', createdAt: serverTimestamp() });
  profile = (await getDoc(doc(db, 'users', cred.user.uid))).data(); emit();
});
export const signInEmail = wrap(async (email, password) => { await signInWithEmailAndPassword(auth, email, password); });
export const resetPassword = wrap(async email => { await sendPasswordResetEmail(auth, email); });
export const logout = () => signOut(auth);
export const becomeEmployer = wrap(async company => {
  await updateDoc(doc(db, 'users', current.uid), { role: 'employer', company });
  profile = { ...profile, role: 'employer', company }; emit();
});

/* ---------- reports ---------- */
const uidOr = () => { if (!current) throw new Error('Sign in first.'); return current.uid; };
const strip = o => JSON.parse(JSON.stringify(o)); // drop undefined values Firestore rejects

export const saveReport = wrap(async (prof, result) => (await addDoc(collection(db, 'users', uidOr(), 'reports'), { profile: strip(prof), result: strip(result), done: [], createdAt: serverTimestamp() })).id);
export const listReports = wrap(async () => (await getDocs(collection(db, 'users', uidOr(), 'reports'))).docs
  .map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
export const getReport = wrap(async id => { const s = await getDoc(doc(db, 'users', uidOr(), 'reports', id)); return s.exists() ? { id, ...s.data() } : null; });
export const setDone = wrap(async (id, done) => updateDoc(doc(db, 'users', uidOr(), 'reports', id), { done }));
export const deleteReport = wrap(async id => deleteDoc(doc(db, 'users', uidOr(), 'reports', id)));

/* ---------- saved jobs ---------- */
const jobKey = id => String(id).replace(/[/.#$[\]]/g, '_').slice(0, 300);
export const saveJob = wrap(async j => setDoc(doc(db, 'users', uidOr(), 'saved_jobs', jobKey(j.id)), {
  title: String(j.title).slice(0, 300), company: String(j.company || '').slice(0, 200), url: String(j.url || '').slice(0, 1000),
  location: String(j.location || '').slice(0, 300), source: String(j.source || '').slice(0, 40), posted: j.posted || null, savedAt: serverTimestamp(),
}));
export const unsaveJob = wrap(async id => deleteDoc(doc(db, 'users', uidOr(), 'saved_jobs', jobKey(id))));
export const listSaved = wrap(async () => (await getDocs(collection(db, 'users', uidOr(), 'saved_jobs'))).docs
  .map(d => ({ key: d.id, ...d.data() })).sort((a, b) => (b.savedAt?.seconds || 0) - (a.savedAt?.seconds || 0)));
export const savedKey = jobKey;

/* ---------- employer postings ---------- */
const JOB_FIELDS = ['title', 'company', 'location', 'type', 'salary', 'description', 'applyUrl'];
function cleanJob(d) {
  const o = {};
  for (const k of JOB_FIELDS) o[k] = String(d[k] || '').trim();
  o.remote = !!d.remote;
  if (!o.title || !o.company || !o.description) throw new Error('Title, company and description are required.');
  if (!/^(https:\/\/|mailto:)/i.test(o.applyUrl)) throw new Error('The apply link must start with https:// or mailto:');
  return o;
}
export const postJob = wrap(async d => (await addDoc(collection(db, 'jobs'), { ...cleanJob(d), ownerUid: uidOr(), status: 'open', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id);
export const setJobStatus = wrap(async (id, status) => updateDoc(doc(db, 'jobs', id), { status, updatedAt: serverTimestamp() }));
export const deleteJob = wrap(async id => deleteDoc(doc(db, 'jobs', id)));
export const myJobs = wrap(async () => (await getDocs(query(collection(db, 'jobs'), where('ownerUid', '==', uidOr())))).docs
  .map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
export const openJobs = async () => {
  try {
    return (await getDocs(query(collection(db, 'jobs'), where('status', '==', 'open'), limit(200)))).docs
      .map(d => ({ id: 'willai:' + d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (e) { console.warn('openJobs', e.code || e.message); return []; }
};
