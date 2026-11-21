// WillAI frontend. Plain ES modules, no build step.
const API = window.WILLAI.apiBase;
let fb = null;
try { fb = await import('./firebase.js'); } catch (e) { console.warn('Firebase unavailable', e); }

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^(https?:\/\/|mailto:)/i.test(u || '') ? esc(u) : '#');
const num = n => Number(n || 0).toLocaleString('en-IN');
const pct = x => Math.round((x || 0) * 100) + '%';
const hm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
const ago = iso => {
  const t = typeof iso === 'object' && iso?.seconds ? iso.seconds * 1000 : Date.parse(iso);
  if (!t) return ''; const m = (Date.now() - t) / 6e4;
  return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  google: '<path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.3c1.9-1.8 3-4.4 3-7.4Z" fill="#4285F4" stroke="none"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" fill="#34A853" stroke="none"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z" fill="#FBBC05" stroke="none"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3 7.4L6.4 10c.8-2.3 3-4 5.6-4Z" fill="#EA4335" stroke="none"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2400); }
const level = s => s >= 65 ? 'Very high exposure' : s >= 45 ? 'High exposure' : s >= 25 ? 'Moderate exposure' : 'Low exposure';
const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const tk = fb ? await fb.token().catch(() => null) : null;
  if (tk) headers.authorization = 'Bearer ' + tk;
  let r;
  try { r = await fetch(API + path, { ...opts, headers }); }
  catch { throw new Error('The WillAI server is not reachable right now. If it was asleep it can take about 30 seconds to wake up, so try again shortly.'); }
  const d = await r.json().catch(() => ({ error: 'Unexpected server response.' }));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

/* ---------------- state ---------------- */
let TRENDS = null, USER = null, PROFILE = null, SAVED = new Set(), WILLAI_JOBS = null;
const signedIn = () => !!USER;

// The free backend sleeps when idle and its first collection takes a minute or two.
// Never show "0 openings": show a waking state and poll /api/health until real data is there.
let WAKING = null;
async function loadTrends() {
  try {
    const t = await api('/api/trends');
    if (!t.total) throw new Error('empty');
    TRENDS = t;
    $('#board').innerHTML = `<span class="asof">${num(TRENDS.total)} openings · ${hm(TRENDS.collectedAt)}</span>`;
  } catch {
    $('#board').innerHTML = '<span class="asof waking">waking the job board</span>';
    WAKING ||= wake();
  }
  return TRENDS;
}
async function wake() {
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60e3) {
    await new Promise(r => setTimeout(r, 3000));
    const h = await fetch(API + '/api/health').then(r => r.json()).catch(() => null);
    if (h?.postings > 0) {
      WAKING = null;
      const before = TRENDS;
      await loadTrends();
      if (TRENDS && !before) { toast(`${num(TRENDS.total)} openings ready`); route(); }
      return;
    }
    if (h) $('#board').innerHTML = `<span class="asof waking">${h.collecting ? 'collecting today\'s openings' : 'waking the job board'}</span>`;
  }
  WAKING = null;
  $('#board').innerHTML = '<span class="asof off">job board offline</span>';
}

function renderAcct() {
  const el = $('#acct');
  if (!fb) { el.innerHTML = ''; return; }
  if (!USER) { el.innerHTML = '<a class="link" href="#/signin">Sign in</a>'; return; }
  const name = PROFILE?.name || USER.displayName || USER.email || 'Account';
  const av = USER.photoURL ? `<img src="${esc(USER.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(name[0].toUpperCase());
  el.innerHTML = `<a class="acct" href="#/me"><span class="avatar">${av}</span><span>${esc(name.split(' ')[0])}</span></a>`;
}

if (fb) fb.onUser(async (u, p) => {
  USER = u; PROFILE = p; renderAcct();
  SAVED = new Set();
  if (u) { try { (await fb.listSaved()).forEach(s => SAVED.add(s.key)); } catch {} }
  const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (['me', 'employers', 'signin', 'jobs'].includes(r)) route();
});

/* ---------------- router ---------------- */
const routes = { '': home, report, jobs: jobsPage, employers, me, signin, market, about };
function route() {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [r, ...rest] = path.split('/');
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r || (r === 'report' && a.dataset.r === '')));
  (routes[r] || home)(rest.map(decodeURIComponent));
}
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });

/* ---------------- shared pieces ---------------- */
const ledger = tasks => `<div class="ledger" role="img" aria-label="Tasks by AI exposure">${tasks.map(t => `<div class="${esc(t.category)}" style="flex:1" title="${esc(t.task)}: ${t.exposure}%">${t.exposure}%</div>`).join('')}</div>`;
const ledgerKey = () => '<div class="ledger-key"><span><i class="automate-c"></i>AI can do most of it</span><span><i class="augment-c"></i>AI helps, you lead</span><span><i class="human-c"></i>Stays with you</span></div>';
const ranked = (items, n = 10) => {
  if (!items?.length) return '<p class="t3" style="font-size:14px">No data yet</p>';
  const list = items.slice(0, n), max = Math.max(...list.map(x => x.v));
  return `<ul class="ranked">${list.map(x => `<li><span title="${esc(x.k)}">${esc(x.k)}</span><div class="track"><i style="width:${(x.v / max) * 100}%"></i></div><b>${num(x.v)}</b></li>`).join('')}</ul>`;
};

/* ---------------- home ---------------- */
const EXAMPLES = [
  { role: 'Staff Nurse', years: '6', skills: 'ICU patient care, medication charts, shift handover notes, training junior nurses, counselling families', country: 'India (Hyderabad)', education: 'BSc Nursing', constraints: 'night shifts, small budget' },
  { role: 'Accountant', years: '4', skills: 'Tally, GST filing, invoices, bank reconciliation, Excel reports for the owner', country: 'India (Pune)', education: 'B.Com' },
  { role: 'Farmer', years: '15', skills: 'paddy and cotton on 5 acres, choosing seeds, hiring labour, selling at the mandi', country: 'India (Warangal)', education: '10th class', constraints: 'little time, basic smartphone, Telugu speaker' },
  { role: 'Software Engineer', years: '3', skills: 'React, Node.js, REST APIs, writing tests, fixing production bugs', country: 'India (Bengaluru)', education: 'B.Tech CSE', target: 'AI engineer' },
  { role: 'School Teacher', years: '10', skills: 'teaching maths to class 8 to 10, lesson plans, grading, parent meetings', country: 'India (Chennai)', education: 'B.Ed' },
  { role: 'Truck Driver', years: '12', skills: 'long-haul driving, loading, basic repairs, route knowledge', country: 'India (Nagpur)', education: '8th class' },
  { role: 'Call Centre Agent', years: '2', skills: 'inbound customer calls, CRM updates, handling complaints in Hindi and English', country: 'India (Noida)', education: 'BA' },
];
const FIELDS = ['role', 'years', 'skills', 'country', 'education', 'target', 'constraints'];
let SAMPLE = null;

async function home() {
  const t = TRENDS;
  app.innerHTML = `<section class="hero enter">
    <div>
      <h1>See what AI can do in your job, and where to go next</h1>
      <p class="lede">For nurses, farmers, accountants, drivers, engineers and every other trade. We compare your work with <b>${t ? num(t.total) : 'thousands of'} openings</b> collected today and give you a plan for the next 90 days.</p>
      <form class="ask" id="f" autocomplete="on">
        <div class="row">
          <div><label class="f" for="role">Your job</label><input class="in" id="role" name="role" required maxlength="80" placeholder="Nurse, accountant, electrician"></div>
          <div><label class="f" for="years">Years</label><input class="in" id="years" name="years" maxlength="10" inputmode="numeric" placeholder="5"></div>
        </div>
        <div><label class="f" for="skills">What you do on a normal day</label><textarea class="in" id="skills" name="skills" maxlength="800" rows="3" placeholder="Patient care in ICU, medication charts, handover notes, training juniors"></textarea></div>
        <div class="more">
          <div class="grid2">
            <div><label class="f" for="country">Where you work</label><input class="in" id="country" name="country" maxlength="60" placeholder="India (Hyderabad)"></div>
            <div><label class="f" for="education">Education</label><input class="in" id="education" name="education" maxlength="120" placeholder="BSc Nursing"></div>
            <div><label class="f" for="target">A role you are curious about <span>optional</span></label><input class="in" id="target" name="target" maxlength="80" placeholder="Nurse educator"></div>
            <div><label class="f" for="constraints">Limits on your time or budget <span>optional</span></label><input class="in" id="constraints" name="constraints" maxlength="300" placeholder="Night shifts, small budget"></div>
          </div>
        </div>
        <div class="ask-foot"><button class="btn pri lg" type="submit">Analyse my job</button><button class="link" type="button" id="moreBtn">Add more details</button></div>
        <div id="ferr"></div>
        <div class="examples">Try ${EXAMPLES.map((e, i) => `<button type="button" data-ex="${i}">${esc(e.role.toLowerCase())}</button>`).join('')}</div>
      </form>
    </div>
    <div id="preview"></div>
  </section>`;
  const f = $('#f');
  const saved = JSON.parse(sessionStorage.getItem('willai.profile') || 'null');
  if (saved) FIELDS.forEach(k => { if (saved[k]) f[k].value = saved[k]; });
  const setMore = open => { f.classList.toggle('open', open); $('#moreBtn').textContent = open ? 'Fewer details' : 'Add more details'; };
  if (saved && (saved.country || saved.education || saved.target || saved.constraints)) setMore(true);
  $('#moreBtn').onclick = () => setMore(!f.classList.contains('open'));
  $$('[data-ex]').forEach(b => b.onclick = () => { const e = EXAMPLES[b.dataset.ex]; FIELDS.forEach(k => (f[k].value = e[k] || '')); setMore(true); f.role.focus(); });
  f.onsubmit = e => { e.preventDefault(); const p = Object.fromEntries(FIELDS.map(k => [k, f[k].value.trim()])); sessionStorage.setItem('willai.profile', JSON.stringify(p)); run(p); };

  SAMPLE ||= await fetch('sample.json').then(r => r.json()).catch(() => null);
  if (SAMPLE && $('#preview')) {
    const s = SAMPLE;
    $('#preview').innerHTML = `<article class="preview" aria-label="Example report">
      <div class="preview-h"><h3>${esc(s.profile.role)}, ${esc(s.profile.country.replace(/^India \((.*)\)$/, '$1'))}</h3><span class="mono t3">example report</span></div>
      <div class="score"><b>${s.exposure_score}</b><span class="t2">of 100 · ${level(s.exposure_score).toLowerCase()}</span></div>
      <p class="verdict">${esc(s.verdict.split(/(?<=\.)\s/)[0])}</p>
      ${ledger(s.tasks)}
      <ul class="ledger-legend">${s.tasks.map(t => `<li><i class="${esc(t.category)}-c"></i><span>${esc(t.task)}</span><b>${t.exposure}%</b></li>`).join('')}</ul>
      <ul class="roles-mini">${s.future_roles.slice(0, 3).map(r => `<li><span>${esc(r.title)}</span><span class="mono t3">fit ${r.fit}</span></li>`).join('')}</ul>
      <p style="margin-top:16px;font-size:14px"><a href="#/report/example">Read the full example</a></p>
    </article>`;
  }
}

async function run(profile) {
  const stages = ['Reading your work', `Searching ${TRENDS ? num(TRENDS.total) : 'today\'s'} openings`, 'Searching boards for your exact role', 'Splitting your job into tasks', 'Finding roles you could move into', 'Writing your 90-day plan'];
  app.innerHTML = `<div class="loading enter"><h2>Looking at your work as a ${esc(profile.role.toLowerCase())}</h2><ul class="steps" id="st">${stages.map(s => `<li>${icon('check')}<span>${esc(s)}</span></li>`).join('')}</ul></div>`;
  const lis = $$('#st li'); let i = 0;
  lis[0].classList.add('on');
  const tick = setInterval(() => { if (i < lis.length - 1) { lis[i].classList.replace('on', 'done'); lis[++i].classList.add('on'); } }, 4500);
  try {
    const result = await api('/api/advise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) });
    clearInterval(tick);
    const rep = { profile, result, at: new Date().toISOString(), done: [] };
    if (fb && USER) { try { rep.id = await fb.saveReport(profile, result); } catch (e) { console.warn(e); } }
    sessionStorage.setItem('willai.report', JSON.stringify(rep));
    location.hash = rep.id ? '#/report/' + rep.id : '#/report';
  } catch (e) {
    clearInterval(tick);
    await home();
    $('#ferr').innerHTML = `<p class="err">${esc(e.message)}</p><p class="t2" style="font-size:14px;margin-top:8px">You can still <a href="#/jobs?q=${encodeURIComponent(profile.role)}">browse open jobs for ${esc(profile.role.toLowerCase())}</a>.</p>`;
  }
}

/* ---------------- report ---------------- */
async function report([id]) {
  let rep = JSON.parse(sessionStorage.getItem('willai.report') || 'null');
  if (id === 'example') {
    SAMPLE ||= await fetch('sample.json').then(r => r.json()).catch(() => null);
    if (!SAMPLE) { location.hash = '#/'; return; }
    rep = { profile: SAMPLE.profile, result: SAMPLE, at: null, example: true, done: [] };
  } else if (id && (!rep || rep.id !== id)) {
    if (!fb) { location.hash = '#/'; return; }
    app.innerHTML = '<div class="loading"><h2>Opening your report</h2></div>';
    if (!fb.isReady()) await new Promise(res => { const off = fb.onUser(() => { off(); res(); }); });
    if (!USER) { location.hash = '#/signin?next=' + encodeURIComponent('#/report/' + id); return; }
    const d = await fb.getReport(id).catch(() => null);
    if (!d) { app.innerHTML = '<div class="loading"><h2>Report not found</h2><a class="link" href="#/me">Your reports</a></div>'; return; }
    rep = { id, profile: d.profile, result: d.result, done: d.done || [], at: d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toISOString() : null };
    sessionStorage.setItem('willai.report', JSON.stringify(rep));
  }
  if (!rep) { location.hash = '#/'; return; }
  const { profile: p, result: r } = rep, m = r.market || {};
  const done = new Set(rep.example ? [] : rep.id ? rep.done || [] : JSON.parse(localStorage.getItem('willai.plan.' + p.role.toLowerCase()) || '[]'));
  const allSteps = r.plan.flatMap((ph, i) => ph.steps.map((_, j) => `${i}.${j}`));
  const evidence = { strong: 'Strong live evidence', partial: 'Some live evidence', thin: 'Little live evidence, mostly general knowledge' }[r.evidence_quality] || '';

  app.innerHTML = `<div class="enter">
  <header class="rep-h">
    <div>
      <p class="crumbs"><a href="#/">${rep.example ? 'Example report · analyse your own job' : 'New analysis'}</a>${p.country ? ' · ' + esc(p.country) : ''}${p.years ? ` · ${esc(p.years)} years` : ''}${rep.at ? ' · ' + new Date(rep.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
      <h1>${esc(p.role)}</h1>
      <p class="verdict">${esc(r.verdict)}</p>
      <div class="meta"><span class="asof">${esc(evidence)}</span><span class="mono t3">${num(r.used_postings)} openings read${m.count != null ? ` · ${num(m.count)} open now` : ''}</span></div>
    </div>
    <div class="figure"><div class="big">${r.exposure_score}</div><p class="of">of 100 · ${level(r.exposure_score).toLowerCase()}</p>${r.exposure_2030 != null ? `<p class="proj">${r.exposure_2030} projected by 2030</p>` : ''}</div>
  </header>

  <section class="rep-ledger"><h2>Your work, task by task</h2>${ledger(r.tasks)}${ledgerKey()}</section>

  <div class="cols">
    <section class="card"><h2>What AI can and cannot do in each task</h2><p class="sub">The share of each task AI can do or speed up today</p>
      <div class="tasks">${r.tasks.map(t => `<div class="task"><b>${esc(t.task)}</b><span class="kind"><i class="${esc(t.category)}-c"></i>${t.exposure}%</span><p>${esc(t.why)}</p></div>`).join('')}</div>
    </section>
    <div class="stack">
      <section class="card"><h2>What stays with you</h2><p class="sub">The parts employers will keep paying a person for</p>
        <ul class="bullets">${r.human_edge.map(h => `<li>${esc(h)}</li>`).join('')}</ul></section>
      <section class="card"><h2>Skills to learn next</h2><p class="sub">Drawn from what open roles are asking for</p>
        <ul class="bullets">${r.skills_to_learn.map(k => `<li><b>${esc(k.skill)}</b>${k.reason ? '. ' + esc(k.reason) : ''}</li>`).join('')}</ul></section>
    </div>
  </div>

  <section style="margin-top:48px">
    <h2 style="font:400 28px/1.2 var(--serif)">Roles you could move into</h2>
    <p class="t2" style="margin-top:4px">Reachable in 6 to 24 months, with openings that exist today</p>
    <div class="roles">${r.future_roles.map(fr => `<article class="role">
      <div class="role-h"><h3>${esc(fr.title)}</h3><span class="fit">fit ${fr.fit}</span></div>
      <div class="fitbar"><i style="width:${fr.fit}%"></i></div>
      <p>${esc(fr.why)}</p>
      ${fr.gap?.length ? `<p class="gap"><b>Missing:</b> ${fr.gap.map(esc).join(', ')}</p>` : ''}
      <div class="openings">${(fr.evidence || []).map(e => `<a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">${icon('ext')}<span>${esc(e.title)} · ${esc(e.company)}</span></a>`).join('')}
        <a href="#/jobs?q=${encodeURIComponent(fr.title)}">${icon('search')}<span>Search openings for this role</span></a></div>
    </article>`).join('')}</div>
  </section>

  <section class="card" style="margin-top:48px">
    <div class="plan-h"><div><h2 style="font:400 28px/1.2 var(--serif)">Your next 90 days</h2>
      <p class="t2" style="margin-top:4px">${rep.id ? 'Progress is saved to your account' : 'Progress is saved on this device. Sign in to keep it everywhere'}</p></div>
      <div class="progress"><div class="track"><i id="pbar"></i></div><span id="ptxt" class="mono"></span></div></div>
    <div class="phases">${r.plan.map((ph, i) => `<div class="phase"><span class="d">${esc(ph.days)}</span><h4>${esc(ph.phase.replace(/^\s*days?\s*\d+\s*[-–to]+\s*\d+\s*[:.\-–]\s*/i, ''))}</h4>
      ${ph.steps.map((st, j) => `<button class="step${done.has(`${i}.${j}`) ? ' done' : ''}" data-k="${i}.${j}"><span class="box">${icon('check')}</span><span class="tx">${esc(st)}</span></button>`).join('')}</div>`).join('')}</div>
  </section>

  <div class="cols">
    <section class="card"><h2>Open now for this work</h2><p class="sub">${esc(r.market_read)}</p>
      <div class="stats three"><div class="stat"><p class="k">Open roles</p><p class="v">${num(m.count)}</p></div><div class="stat"><p class="k">Ask for AI skills</p><p class="v">${pct(m.aiMentionRate)}</p></div><div class="stat"><p class="k">Remote</p><p class="v">${pct(m.remoteShare)}</p></div></div>
      <div class="joblist" style="margin-top:16px">${(m.postings || []).slice(0, 6).map(jobRow).join('') || '<p class="empty">No matching openings in our sources right now</p>'}
        <div class="more-row"><span>Every opening for this work</span><a class="link" href="#/jobs?q=${encodeURIComponent(p.role)}">Open jobs for ${esc(p.role.toLowerCase())}</a></div></div>
    </section>
    <div class="stack">
      <section class="card"><h2>Who is hiring</h2><p class="sub">Companies with the most matching openings</p>${ranked(m.companies, 8)}</section>
      ${rep.example ? '' : `<section class="card save-note"><div><h2>${rep.id ? 'Saved to your account' : 'Keep this report'}</h2><p class="t2" style="font-size:14px">${rep.id ? 'Find it any time under your account' : 'Sign in to save it and track your plan on any device'}</p></div>
        <span style="display:flex;gap:8px">${rep.id ? '<a class="btn sm" href="#/me">Your account</a>' : fb ? `<button class="btn sm" id="keep">${signedIn() ? 'Save report' : 'Sign in to save'}</button>` : ''}<button class="btn sm" id="print">Print</button></span></section>`}
    </div>
  </div>
  <p class="mono t3" style="margin-top:24px">Written by ${esc(r.model)} from live job data. AI can be wrong, so check what matters to you</p>
  </div>`;

  const upd = () => { $('#pbar').style.width = (allSteps.length ? (done.size / allSteps.length) * 100 : 0) + '%'; $('#ptxt').textContent = `${done.size} of ${allSteps.length}`; };
  upd();
  $$('.step').forEach(b => b.onclick = () => {
    const k = b.dataset.k; done.has(k) ? done.delete(k) : done.add(k); b.classList.toggle('done'); upd();
    if (rep.example) return;
    rep.done = [...done]; sessionStorage.setItem('willai.report', JSON.stringify(rep));
    if (rep.id && fb) fb.setDone(rep.id, rep.done).catch(() => toast('Could not save progress'));
    else localStorage.setItem('willai.plan.' + p.role.toLowerCase(), JSON.stringify(rep.done));
  });
  bindJobActions(m.postings || []);
  if ($('#print')) $('#print').onclick = () => print();
  const keep = $('#keep');
  if (keep) keep.onclick = async () => {
    if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent('#/report'); return; }
    keep.disabled = true;
    try { rep.id = await fb.saveReport(p, r); await fb.setDone(rep.id, [...done]); sessionStorage.setItem('willai.report', JSON.stringify(rep)); location.hash = '#/report/' + rep.id; toast('Saved'); }
    catch (e) { keep.disabled = false; toast(e.message); }
  };
}

/* ---------------- jobs (portal) ---------------- */
function jobRow(j) {
  const key = fb ? fb.savedKey(j.id) : j.id, saved = SAVED.has(key), own = String(j.id).startsWith('willai:');
  const desc = j.description || j.snippet, href = safeUrl(j.url || j.applyUrl);
  const loc = j.location ? (j.location.length > 48 ? j.location.slice(0, 46).replace(/[,\s]+[^,]*$/, '') + ' and more' : j.location) : '';
  return `<div class="job">
    <h3><a href="${href}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a></h3>
    <div class="acts">
      <button class="icon-btn${saved ? ' on' : ''}" data-save="${esc(j.id)}" title="${saved ? 'Saved' : 'Save'}" aria-label="Save job">${icon('bookmark')}</button>
      <a class="btn sm" href="${href}" target="_blank" rel="noopener noreferrer">Apply</a>
    </div>
    <p class="co"><span>${esc(j.company)}</span>${loc ? `<span>${icon('pin')} ${esc(loc)}</span>` : ''}
      ${j.posted ? `<span class="mono t3">${ago(j.posted)}</span>` : ''}
      ${own ? '<span class="tagq own">Posted on WillAI</span>' : `<span class="mono t3">${esc(j.source || '')}</span>`}
      ${j.remote ? '<span class="tagq">Remote</span>' : ''}${j.ai ? '<span class="tagq">Asks for AI skills</span>' : ''}${j.salary ? `<span class="tagq">${esc(j.salary)}</span>` : ''}${j.type ? `<span class="tagq">${esc(j.type)}</span>` : ''}</p>
    ${desc ? `<details><summary>Details</summary><p>${esc(desc)}</p></details>` : ''}
  </div>`;
}
function bindJobActions(list) {
  const byId = new Map(list.map(j => [String(j.id), j]));
  $$('[data-save]').forEach(b => b.onclick = async () => {
    if (!fb) return;
    if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent(location.hash); return; }
    const j = byId.get(b.dataset.save); if (!j) return;
    const key = fb.savedKey(j.id);
    try {
      if (SAVED.has(key)) { await fb.unsaveJob(j.id); SAVED.delete(key); b.classList.remove('on'); toast('Removed from saved'); }
      else { await fb.saveJob({ ...j, url: j.url || j.applyUrl }); SAVED.add(key); b.classList.add('on'); toast('Saved'); }
    } catch (e) { toast(e.message); }
  });
}

let JOBS = { key: '', items: [], page: 0, pages: 0, total: 0 };
async function jobsPage() {
  const hp = hashParams();
  const q = hp.get('q') || '', remote = hp.get('remote') === '1', ai = hp.get('ai') === '1', recent = hp.get('recent') === '1';
  const last = JSON.parse(sessionStorage.getItem('willai.report') || 'null');
  const suggestions = last?.result?.future_roles?.map(r => r.title).slice(0, 4) || [];
  app.innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>Open jobs</h1><p>Live openings from company career pages and job boards, plus roles employers post here</p></div></header>
    <form class="jobs-bar" id="jf">
      <label class="search">${icon('search')}<input class="in" name="q" value="${esc(q)}" placeholder="Job title, skill or company" maxlength="80" aria-label="Search"></label>
      <button class="btn pri">Search</button>
    </form>
    <div class="filters">
      <label class="check"><input type="checkbox" data-flt="remote" ${remote ? 'checked' : ''}>Remote</label>
      <label class="check"><input type="checkbox" data-flt="ai" ${ai ? 'checked' : ''}>Asks for AI skills</label>
      <label class="check"><input type="checkbox" data-flt="recent" ${recent ? 'checked' : ''}>Posted this week</label>
    </div>
    ${suggestions.length ? `<div class="suggest">From your report ${suggestions.map(s => `<a href="#/jobs?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>` : ''}
    <div class="joblist" id="jl"><p class="empty">Loading openings</p></div>
  </div>`;
  const go = over => {
    const p = new URLSearchParams({ q, remote: remote ? '1' : '', ai: ai ? '1' : '', recent: recent ? '1' : '', ...over });
    for (const [k, v] of [...p]) if (!v || v === '0') p.delete(k);
    location.hash = '#/jobs?' + p;
  };
  $('#jf').onsubmit = e => { e.preventDefault(); go({ q: e.target.q.value.trim() }); };
  $$('[data-flt]').forEach(c => c.onchange = () => go({ [c.dataset.flt]: c.checked ? '1' : '' }));

  const qs = page => new URLSearchParams({ q, remote: remote ? 1 : 0, ai: ai ? 1 : 0, recent: recent ? 1 : 0, page });
  const key = JSON.stringify([q, remote, ai, recent]);
  const draw = () => {
    $('#jl').innerHTML = JOBS.items.length ? JOBS.items.map(jobRow).join('') + `<div class="more-row"><span class="mono">${num(JOBS.items.length)} of ${num(JOBS.total)}</span>${JOBS.page < JOBS.pages ? '<button class="btn sm" id="more">Load more</button>' : ''}</div>`
      : `<p class="empty">No openings match${q ? ` "${esc(q)}"` : ''}. Try a broader title</p>`;
    bindJobActions(JOBS.items);
    const more = $('#more');
    if (more) more.onclick = async () => {
      more.disabled = true;
      try { const d = await api('/api/jobs?' + qs(JOBS.page + 1)); JOBS.items.push(...d.items); JOBS.page = d.page; JOBS.pages = d.pages; draw(); }
      catch (e) { toast(e.message); more.disabled = false; }
    };
  };
  try {
    if (JOBS.key !== key) {
      const [d, own] = await Promise.all([api('/api/jobs?' + qs(1)), ownJobs()]);
      const ql = q.toLowerCase();
      const mine = ai || recent ? [] : own.filter(j => (!remote || j.remote) && (!ql || `${j.title} ${j.company} ${j.description}`.toLowerCase().includes(ql)));
      JOBS = { key, items: [...mine, ...d.items], page: 1, pages: d.pages, total: d.total + mine.length };
    }
    draw();
  } catch (e) { $('#jl').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}
async function ownJobs() {
  if (!fb) return [];
  WILLAI_JOBS ||= (await fb.openJobs()).map(j => ({ ...j, url: j.applyUrl, posted: j.createdAt?.seconds ? new Date(j.createdAt.seconds * 1000).toISOString() : null, source: 'willai' }));
  return WILLAI_JOBS;
}

/* ---------------- employers ---------------- */
async function employers() {
  if (!fb) { app.innerHTML = '<div class="prose"><h1>For employers</h1><p>Posting jobs needs sign-in, which is unavailable right now.</p></div>'; return; }
  if (!fb.isReady()) { app.innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  if (!USER) {
    app.innerHTML = `<div class="enter"><header class="page-h"><div><h1>Hire people who are changing careers</h1>
      <p>Nurses moving into clinical research, accountants moving into analytics, drivers moving into fleet operations. Post a role and it appears next to live openings for everyone searching here, free.</p></div></header>
      <div class="ask-foot"><a class="btn pri lg" href="#/signin?role=employer&next=${encodeURIComponent('#/employers')}">Sign in to post a job</a><a class="link" href="#/jobs">See open jobs</a></div></div>`;
    return;
  }
  if (PROFILE?.role !== 'employer') {
    app.innerHTML = `<div class="auth enter"><h1>Switch to an employer account</h1><p class="t2">Your account is set up for finding work. Add your company to post roles. Everything else keeps working.</p>
      <form class="card" id="ef"><div><label class="f" for="company">Company name</label><input class="in" id="company" required maxlength="120" value="${esc(PROFILE?.company || '')}"></div>
      <button class="btn pri">Become an employer</button><div id="eerr"></div></form></div>`;
    $('#ef').onsubmit = async e => { e.preventDefault(); try { await fb.becomeEmployer($('#company').value.trim()); employers(); } catch (er) { $('#eerr').innerHTML = `<p class="err">${esc(er.message)}</p>`; } };
    return;
  }
  app.innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>Your job postings</h1><p>Roles you post appear on the Jobs page for everyone, marked as posted on WillAI</p></div></header>
    <div class="cols" style="margin-top:0">
      <form class="card" id="pj">
        <h2>Post a job</h2><p class="sub">Clear titles and pay ranges get more applicants</p>
        <div class="grid2">
          <div class="full"><label class="f" for="title">Job title</label><input class="in" id="title" required maxlength="120" placeholder="Clinical research coordinator"></div>
          <div><label class="f" for="company">Company</label><input class="in" id="company" required maxlength="120" value="${esc(PROFILE.company || '')}"></div>
          <div><label class="f" for="location">Location</label><input class="in" id="location" maxlength="120" placeholder="Hyderabad"></div>
          <div><label class="f" for="type">Type</label><select class="in" id="type">${['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'].map(t => `<option>${t}</option>`).join('')}</select></div>
          <div><label class="f" for="salary">Pay <span>optional</span></label><input class="in" id="salary" maxlength="80" placeholder="₹6–8 lakh a year"></div>
          <div class="full"><label class="check"><input type="checkbox" id="remote">Remote is possible</label></div>
          <div class="full"><label class="f" for="description">Description</label><textarea class="in" id="description" required minlength="11" maxlength="6000" rows="6" placeholder="What the person will do, what you need, and who would fit even without the exact title"></textarea></div>
          <div class="full"><label class="f" for="applyUrl">Where to apply</label><input class="in" id="applyUrl" required maxlength="500" placeholder="https://yourcompany.com/careers/123 or mailto:hr@yourcompany.com"></div>
        </div>
        <div class="ask-foot" style="margin-top:16px"><button class="btn pri">Post job</button></div><div id="perr"></div>
      </form>
      <section class="card"><h2>Posted by you</h2><p class="sub">${esc(PROFILE.company || '')}</p><ul class="rowlist" id="mine"><li class="t3">Loading</li></ul></section>
    </div></div>`;
  const draw = async () => {
    const list = await fb.myJobs().catch(() => []);
    $('#mine').innerHTML = list.length ? list.map(j => `<li><div><b style="font-weight:500">${esc(j.title)}</b><br><span class="mono t3">${esc(j.status)} · ${ago(j.createdAt)}</span></div>
      <span class="r"><button class="btn sm" data-st="${esc(j.id)}" data-to="${j.status === 'open' ? 'closed' : 'open'}">${j.status === 'open' ? 'Close' : 'Reopen'}</button><button class="icon-btn" data-del="${esc(j.id)}" title="Delete" aria-label="Delete">${icon('trash')}</button></span></li>`).join('') : '<li class="t3">Nothing posted yet</li>';
    $$('[data-st]').forEach(b => b.onclick = async () => { b.disabled = true; try { await fb.setJobStatus(b.dataset.st, b.dataset.to); WILLAI_JOBS = null; JOBS.key = ''; draw(); } catch (e) { toast(e.message); b.disabled = false; } });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; toast('Click again to delete'); setTimeout(() => (b.dataset.armed = ''), 3000); return; }
      try { await fb.deleteJob(b.dataset.del); WILLAI_JOBS = null; JOBS.key = ''; draw(); toast('Deleted'); } catch (e) { toast(e.message); }
    });
  };
  draw();
  $('#pj').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button.pri'); btn.disabled = true; $('#perr').innerHTML = '';
    const d = Object.fromEntries(['title', 'company', 'location', 'type', 'salary', 'description', 'applyUrl'].map(k => [k, $('#' + k).value]));
    d.remote = $('#remote').checked;
    try { await fb.postJob(d); WILLAI_JOBS = null; JOBS.key = ''; e.target.reset(); $('#company').value = PROFILE.company || ''; toast('Job posted'); draw(); }
    catch (er) { $('#perr').innerHTML = `<p class="err">${esc(/permission/i.test(er.message) ? 'Could not post. Check the fields and try again.' : er.message)}</p>`; }
    btn.disabled = false;
  };
}

/* ---------------- account ---------------- */
async function me() {
  if (!fb) { location.hash = '#/'; return; }
  if (!fb.isReady()) { app.innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  if (!USER) { location.hash = '#/signin?next=' + encodeURIComponent('#/me'); return; }
  const name = PROFILE?.name || USER.displayName || '';
  app.innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>${esc(name || 'Your account')}</h1><p>${esc(USER.email || '')} · ${PROFILE?.role === 'employer' ? 'Employer' + (PROFILE.company ? ', ' + esc(PROFILE.company) : '') : 'Looking for work'}</p></div>
      <button class="btn" id="out">Sign out</button></header>
    <div class="cols" style="margin-top:0">
      <section class="card"><h2>Your reports</h2><p class="sub">Every analysis you run while signed in</p><ul class="rowlist" id="reps"><li class="t3">Loading</li></ul></section>
      <section class="card"><h2>Saved jobs</h2><p class="sub">Openings you bookmarked</p><ul class="rowlist" id="sj"><li class="t3">Loading</li></ul></section>
    </div></div>`;
  $('#out').onclick = async () => { await fb.logout(); sessionStorage.removeItem('willai.report'); location.hash = '#/'; };
  const [reps, saved] = await Promise.all([fb.listReports().catch(() => []), fb.listSaved().catch(() => [])]);
  $('#reps').innerHTML = reps.length ? reps.map(r => {
    const steps = (r.result?.plan || []).reduce((a, p) => a + p.steps.length, 0);
    return `<li><div><a href="#/report/${esc(r.id)}" style="color:var(--t1);font-weight:500">${esc(r.profile?.role)}</a><br><span class="mono t3">exposure ${r.result?.exposure_score} · plan ${(r.done || []).length} of ${steps} · ${ago(r.createdAt)}</span></div>
      <span class="r"><a class="btn sm" href="#/report/${esc(r.id)}">Open</a><button class="icon-btn" data-delrep="${esc(r.id)}" title="Delete" aria-label="Delete report">${icon('trash')}</button></span></li>`;
  }).join('') : '<li class="t3">No reports yet. <a href="#/">Analyse your job</a></li>';
  $('#sj').innerHTML = saved.length ? saved.map(s => `<li><div><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--t1);font-weight:500">${esc(s.title)}</a><br><span class="mono t3">${esc(s.company)} · saved ${ago(s.savedAt)}</span></div>
      <span class="r"><a class="btn sm" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Apply</a><button class="icon-btn" data-unsave="${esc(s.key)}" title="Remove" aria-label="Remove saved job">${icon('trash')}</button></span></li>`).join('') : '<li class="t3">Nothing saved yet. <a href="#/jobs">Browse jobs</a></li>';
  $$('[data-delrep]').forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; toast('Click again to delete'); setTimeout(() => (b.dataset.armed = ''), 3000); return; }
    await fb.deleteReport(b.dataset.delrep).catch(e => toast(e.message)); me();
  });
  $$('[data-unsave]').forEach(b => b.onclick = async () => { await fb.unsaveJob(b.dataset.unsave).catch(e => toast(e.message)); SAVED.delete(b.dataset.unsave); me(); });
}

function signin() {
  if (!fb) { app.innerHTML = '<div class="auth"><h1>Sign-in is unavailable</h1><p class="t2">The sign-in service could not be loaded. Check your connection and reload.</p></div>'; return; }
  const hp = hashParams(), next = hp.get('next') || '#/me', wantEmployer = hp.get('role') === 'employer';
  if (USER) { location.hash = next; return; }
  let mode = wantEmployer ? 'up' : 'in', role = wantEmployer ? 'employer' : 'seeker';
  const draw = () => {
    app.innerHTML = `<div class="auth enter">
      <h1>${mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
      <p class="t2">${role === 'employer' ? 'Post roles for people changing careers' : 'Keep your reports, track your 90-day plan and save jobs'}</p>
      <div class="card">
        <button class="btn lg" id="g">${icon('google')}Continue with Google</button>
        <div class="or">or with email</div>
        <form id="af" style="display:flex;flex-direction:column;gap:16px">
          ${mode === 'up' ? `<div><label class="f" for="name">Your name</label><input class="in" id="name" maxlength="120" autocomplete="name"></div>
            <div><span class="f" style="display:block;font-size:13px;font-weight:500;margin-bottom:8px">Account type</span><div class="seg" id="roleSeg"><button type="button" data-role="seeker" class="${role === 'seeker' ? 'on' : ''}">Looking for work</button><button type="button" data-role="employer" class="${role === 'employer' ? 'on' : ''}">Hiring</button></div></div>
            ${role === 'employer' ? '<div><label class="f" for="company">Company</label><input class="in" id="company" required maxlength="120" autocomplete="organization"></div>' : ''}` : ''}
          <div><label class="f" for="email">Email</label><input class="in" id="email" type="email" required autocomplete="email"></div>
          <div><label class="f" for="pw">Password</label><input class="in" id="pw" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></div>
          <button class="btn pri lg">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <div id="aerr"></div>
        <p class="t2" style="font-size:14px">${mode === 'in' ? 'New here? <button class="link" id="sw">Create an account</button> · <button class="link" id="fp">Forgot password</button>' : 'Already have an account? <button class="link" id="sw">Sign in</button>'}</p>
      </div></div>`;
    const err = m => ($('#aerr').innerHTML = `<p class="err">${esc(m)}</p>`);
    const done = () => { location.hash = next; };
    $('#sw').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; draw(); };
    $$('#roleSeg [data-role]').forEach(b => b.onclick = () => { role = b.dataset.role; draw(); });
    if ($('#fp')) $('#fp').onclick = async () => { const em = $('#email').value.trim(); if (!em) return err('Enter your email first.'); try { await fb.resetPassword(em); toast('Reset link sent'); } catch (e) { err(e.message); } };
    $('#g').onclick = async () => { try { await fb.signInGoogle(role); done(); } catch (e) { err(e.message); } };
    $('#af').onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector('button.pri'); b.disabled = true;
      try {
        if (mode === 'in') await fb.signInEmail($('#email').value.trim(), $('#pw').value);
        else await fb.signUpEmail({ name: $('#name').value.trim(), email: $('#email').value.trim(), password: $('#pw').value, role, company: $('#company')?.value.trim() || '' });
        done();
      } catch (er) { err(er.message); b.disabled = false; }
    };
  };
  draw();
}

/* ---------------- market ---------------- */
async function market() {
  const t = TRENDS || await loadTrends();
  app.innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>The job market today</h1><p>Figures computed from every opening we collected${t ? `, ${num(t.total)} from ${num(t.companies)} companies` : ''}</p></div>${t ? `<span class="asof">updated ${hm(t.collectedAt)}</span>` : ''}</header>
    ${t ? `<div class="stats">
      <div class="stat"><p class="k">Openings</p><p class="v">${num(t.total)}</p></div>
      <div class="stat"><p class="k">Ask for AI skills or tools</p><p class="v">${pct(t.aiMentionRate)}</p></div>
      <div class="stat"><p class="k">Roles built around AI</p><p class="v">${pct(t.aiRoleShare)}</p></div>
      <div class="stat"><p class="k">Remote friendly</p><p class="v">${pct(t.remoteShare)}</p></div></div>
    <div class="cols">
      <section class="card"><h2>New roles built around AI</h2><p class="sub">Titles that exist because of AI, by number of openings</p>${ranked(t.emergingRoles, 16)}</section>
      <div class="stack">
        <section class="card"><h2>Hiring the most</h2><p class="sub">Companies by open roles</p>${ranked(t.topCompanies, 8)}</section>
        <section class="card"><h2>Common skill tags</h2><p class="sub">From boards that tag their openings</p>${ranked(t.topTags, 10)}</section>
      </div></div>
    <section class="card" style="margin-top:24px"><h2>Sources</h2><p class="sub">Each connector and how many openings it returned in the last collection</p>
      <ul class="rowlist">${t.sources.map(s => `<li><span>${esc(s.name.replace(':', ' · '))}</span><span class="mono ${s.ok ? 't3' : ''}" style="${s.ok ? '' : 'color:var(--auto)'}">${s.ok ? num(s.count) : 'offline'}</span></li>`).join('')}</ul></section>` : '<p class="note">Market data is unavailable right now</p>'}
  </div>`;
}

/* ---------------- about ---------------- */
function about() {
  app.innerHTML = `<article class="prose enter">
  <h1>How WillAI works</h1>
  <h2>Live openings, collected from public sources</h2>
  <p>Every six hours the server collects open roles from the public job-board APIs companies use for their careers pages: Greenhouse, Lever and Ashby (Anthropic, OpenAI, Stripe, Databricks, Airbnb, Groww, Meesho, CRED and others), plus the open boards Himalayas, Remotive, Arbeitnow, RemoteOK and Jobicy. When you search a role, it also runs a live search for that exact title. We use official public APIs and never scrape sites that forbid it.</p>
  <h2>Signals computed from those openings</h2>
  <ul><li>How many openings ask for AI skills or tools. A posting counts only when it names at least two distinct AI skills, so boilerplate does not.</li>
  <li>Which new titles exist because of AI, ranked by openings.</li>
  <li>Who is hiring, which titles are common, and how many roles are remote.</li></ul>
  <h2>Your analysis</h2>
  <p>Your answers and the most relevant openings go to an AI model (Gemini by default, Claude when configured), which splits your work into tasks, estimates how much of each AI can do, and suggests roles you could move into with openings that exist today. Text from job ads is treated as data, so instructions hidden in an ad are ignored.</p>
  <h2>What the numbers mean</h2>
  <ul><li>Exposure is how much of a task AI can do or speed up. Whether jobs are cut depends on cost, rules, trust and employers.</li>
  <li>Our sources lean toward technology and remote companies. For farming, trades and government roles the report says when evidence is thin.</li>
  <li>AI can be wrong. Treat the report as a starting point.</li></ul>
  <h2>Your data</h2>
  <ul><li>Without an account nothing you type is stored. With an account, your reports, plan progress and saved jobs are stored in your account and only you can read them.</li>
  <li>Employers can post roles. Only the employer who posted a role can change or remove it.</li></ul>
  </article>`;
}

/* ---------------- boot ---------------- */
renderAcct();
route();
loadTrends().then(() => {
  const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (r === 'market') route();
  else if (r === '' && TRENDS && $('.lede b')) $('.lede b').textContent = `${num(TRENDS.total)} openings`;
});
