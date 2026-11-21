// Shared helpers, state, API client and small UI pieces used by every page.
export const API = window.WILLAI.apiBase;
export const S = { fb: null, user: null, profile: null, trends: null, saved: new Set(), dismissed: new Set() };

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const app = () => $('#app');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = u => (/^(https?:\/\/|mailto:)/i.test(u || '') ? esc(u) : '#');
export const num = n => Number(n || 0).toLocaleString('en-IN');
export const pct = x => Math.round((x || 0) * 100) + '%';
export const hm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
export const date = iso => { const d = new Date(iso?.seconds ? iso.seconds * 1000 : iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const ago = iso => {
  const t = typeof iso === 'object' && iso?.seconds ? iso.seconds * 1000 : Date.parse(iso);
  if (!t) return ''; const m = (Date.now() - t) / 6e4;
  return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');
export const go = (path, params) => { const p = new URLSearchParams(params || {}); for (const [k, v] of [...p]) if (!v || v === '0') p.delete(k); location.hash = path + (p.toString() ? '?' + p : ''); };
export const level = s => s >= 65 ? 'Very high exposure' : s >= 45 ? 'High exposure' : s >= 25 ? 'Moderate exposure' : 'Low exposure';
export const signedIn = () => !!S.user;

const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13 13 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 1 1-4.2-4.2"/>',
  google: '<path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.3c1.9-1.8 3-4.4 3-7.4Z" fill="#4285F4" stroke="none"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" fill="#34A853" stroke="none"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z" fill="#FBBC05" stroke="none"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3 7.4L6.4 10c.8-2.3 3-4 5.6-4Z" fill="#EA4335" stroke="none"/>',
};
export const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

export function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const tk = S.fb ? await S.fb.token().catch(() => null) : null;
  if (tk) headers.authorization = 'Bearer ' + tk;
  if (opts.json) { headers['content-type'] = 'application/json'; opts = { ...opts, method: opts.method || 'POST', body: JSON.stringify(opts.json) }; }
  let r;
  try { r = await fetch(API + path, { ...opts, headers }); }
  catch { throw new Error('The WillAI server is not reachable right now. If it was asleep it can take about 30 seconds to wake up, so try again shortly.'); }
  const d = await r.json().catch(() => ({ error: 'Unexpected server response.' }));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// static data shared with the server (skills, cities)
const DATA = {};
export const data = name => (DATA[name] ||= fetch(`data/${name}.json`).then(r => r.json()));

/* ---------------- small shared renderers ---------------- */
export const ranked = (items, n = 10, fmt = x => x.k) => {
  if (!items?.length) return '<p class="t3" style="font-size:14px">No data yet</p>';
  const list = items.slice(0, n), max = Math.max(...list.map(x => x.v));
  return `<ul class="ranked">${list.map(x => `<li><span title="${esc(fmt(x))}">${esc(fmt(x))}</span><div class="track"><i style="width:${(x.v / max) * 100}%"></i></div><b>${num(x.v)}</b></li>`).join('')}</ul>`;
};
export const MODE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Office', unknown: '' };
export const TYPE_LABEL = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' };
export const SENIORITY_LABEL = { intern: 'Internship', entry: 'Fresher', junior: 'Junior', mid: 'Mid level', senior: 'Senior', lead: 'Lead and above', unknown: '' };
export const money = s => {
  if (!s?.max) return '';
  const f = v => s.currency === 'INR' ? (v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : num(v)) : v >= 1000 ? `${Math.round(v / 1000)}k` : num(v);
  const sym = { INR: '₹', USD: '$', GBP: '£', EUR: '€' }[s.currency] || (s.currency ? s.currency + ' ' : '');
  return `${sym}${s.min ? f(s.min) + '–' : ''}${f(s.max)}`;
};

/* ---------------- router ---------------- */
const PAGES = {
  '': () => import('./pages/home.js'), report: () => import('./pages/report.js'), jobs: () => import('./pages/jobs.js'),
  employers: () => import('./pages/employers.js'), me: () => import('./pages/account.js'), profile: () => import('./pages/profile.js'),
  settings: () => import('./pages/settings.js'), signin: () => import('./pages/signin.js'), market: () => import('./pages/market.js'),
  about: () => import('./pages/about.js'), feedback: () => import('./pages/feedback.js'),
};
let seq = 0;
export const currentRoute = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
export async function route() {
  document.getElementById('drawer')?.close?.();          // a job drawer never outlives its page
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [r, ...rest] = path.split('/');
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r || (r === 'report' && a.dataset.r === '')));
  const my = ++seq;
  const mod = await (PAGES[r] || PAGES[''])();
  if (my !== seq) return;                       // a newer navigation started while this page loaded
  await mod.default(rest.map(decodeURIComponent));
}
