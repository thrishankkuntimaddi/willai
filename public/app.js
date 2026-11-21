// WillAI frontend boot: auth state, header, the job-board stamp, then the router. Pages live in js/pages/ and load on demand.
import { S, $, api, esc, num, hm, toast, route, currentRoute, API, icon } from './js/core.js';

try { S.fb = await import('./firebase.js'); } catch (e) { console.warn('Firebase unavailable', e); }

/* ---------------- header: account menu ---------------- */
function renderAcct() {
  const el = $('#acct');
  if (!S.fb) { el.innerHTML = ''; return; }
  if (!S.user) { el.innerHTML = '<a class="btn sm" href="#/signin">Sign in</a>'; return; }
  const name = S.profile?.name || S.user.displayName || S.user.email || 'Account';
  const av = S.user.photoURL ? `<img src="${esc(S.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(name[0].toUpperCase());
  el.innerHTML = `<details class="menu"><summary class="acct" aria-label="Account menu"><span class="avatar">${av}</span><span>${esc(name.split(' ')[0])}</span>${icon('down')}</summary>
    <div class="menu-pop" role="menu">
      <a role="menuitem" href="#/me">${icon('home')}Your reports and jobs</a>
      <a role="menuitem" href="#/profile">${icon('user')}Profile</a>
      <a role="menuitem" href="#/settings">${icon('gear')}Settings</a>
      ${S.profile?.role === 'employer' ? `<a role="menuitem" href="#/employers">${icon('building')}Your job postings</a>` : ''}
      <button role="menuitem" id="signout">${icon('left')}Sign out</button>
    </div></details>`;
  const menu = $('.menu', el);
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.open = false));
  $('#signout').onclick = async () => { await S.fb.logout(); sessionStorage.removeItem('willai.report'); location.hash = '#/'; };
}
document.addEventListener('click', e => { const m = $('.menu[open]'); if (m && !m.contains(e.target)) m.open = false; });

if (S.fb) S.fb.onUser(async (u, p) => {
  const was = S.user?.uid;
  S.user = u; S.profile = p; renderAcct();
  S.saved = new Set(); S.dismissed = new Set();
  if (u) {
    try { (await S.fb.listSaved()).forEach(s => S.saved.add(s.key)); } catch {}
    try { (await S.fb.listDismissed()).forEach(s => S.dismissed.add(s.key)); } catch {}
  }
  if (was !== u?.uid && ['', 'me', 'employers', 'signin', 'jobs', 'profile', 'settings', 'report'].includes(currentRoute())) route();
});

/* ---------------- the "as of" stamp; never "0 openings" ---------------- */
// The free backend sleeps when idle and its first collection takes a minute or two.
let waking = null;
export async function loadTrends() {
  try {
    const t = await api('/api/trends');
    if (!t.total) throw new Error('empty');
    S.trends = t;
    $('#board').innerHTML = `<a class="asof" href="#/market" title="Collected ${esc(new Date(t.collectedAt).toLocaleString())}">${num(t.total)} openings · ${hm(t.collectedAt)}</a>`;
  } catch {
    $('#board').innerHTML = '<span class="asof waking">waking the job board</span>';
    waking ||= wake();
  }
  return S.trends;
}
async function wake() {
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60e3) {
    await new Promise(r => setTimeout(r, 3000));
    const h = await fetch(API + '/api/health').then(r => r.json()).catch(() => null);
    if (h?.postings > 0) {
      waking = null;
      const before = S.trends;
      await loadTrends();
      if (S.trends && !before) { toast(`${num(S.trends.total)} openings ready`); route(); }
      return;
    }
    if (h) $('#board').innerHTML = `<span class="asof waking">${h.collecting ? 'collecting today’s openings' : 'waking the job board'}</span>`;
  }
  waking = null;
  $('#board').innerHTML = '<span class="asof off">job board offline</span>';
}
window.WILLAI.loadTrends = loadTrends;

/* ---------------- boot ---------------- */
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });
renderAcct();
route();
loadTrends().then(t => { if (t && ['', 'market'].includes(currentRoute())) document.dispatchEvent(new CustomEvent('willai:trends')); });
