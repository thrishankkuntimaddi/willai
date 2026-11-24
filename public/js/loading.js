// While the analysis runs: a clear progress list (what is happening now, what is done, how long it has taken), your skills
// lighting up on a small map, and live facts about the role you are aiming for, so the wait is worth something.
import { S, $, $$, app, esc, num, icon, api } from './core.js';
import { describeShort, hasRole } from './career.js';

const pct = x => `${Math.round((x || 0) * 100)}%`;
const list = (rows, n) => rows.slice(0, n).map(r => esc(r.k)).join(', ');

// facts about the target role, from the same live openings the report uses
function factsFrom(m, target) {
  const t = esc(target);
  const out = [];
  if (m.count) out.push({ k: 'Openings now', v: `<b>${num(m.count)}</b> open roles for ${t}${m.lastMonth ? `, <b>${num(m.lastMonth)}</b> posted in the last 30 days` : ''}` });
  if (m.skills?.length) out.push({ k: 'Asked for most', v: `Employers hiring for ${t} ask most for <b>${list(m.skills, 4)}</b>` });
  if (m.companies?.length) out.push({ k: 'Hiring most', v: `<b>${list(m.companies, 3)}</b> have the most openings right now` });
  if (m.locations?.length) out.push({ k: 'Where', v: `Most openings are in <b>${list(m.locations, 3)}</b>` });
  if (m.count) out.push({ k: 'How people work', v: `<b>${pct(m.remoteShare)}</b> remote and <b>${pct(m.hybridShare)}</b> hybrid; the rest are in the office` });
  if (m.count) out.push({ k: 'AI in the job', v: `<b>${pct(m.aiMentionRate)}</b> of these openings ask for AI skills or tools` });
  return out;
}

export function showLoading(c) {
  const target = c.target || c.role;
  const stages = ['Reading your profile', `Searching ${S.trends ? num(S.trends.total) : 'today’s'} openings`, `Matching your skills to ${target ? esc(target.toLowerCase()) : 'roles'}`,
    hasRole(c) ? 'Splitting your work into tasks' : `Splitting ${esc((target || 'the role').toLowerCase())} into tasks`, 'Finding roles you could move into', `Writing your ${c.planDays}-day plan`];
  app().innerHTML = `<div class="loading wide enter">
    <div class="load-h"><div><p class="mono t3">${esc(describeShort(c))}</p><h2>Building your report</h2></div>
      <p class="mono t3 load-time">${icon('clock')}<span id="lt">0:00</span><span class="sep">·</span>usually about a minute</p></div>
    <div class="load-body">
      <div class="load-side">
        <div class="load-bar" role="progressbar" aria-label="Report progress" aria-valuemin="0" aria-valuemax="${stages.length}" aria-valuenow="1"><i id="lb"></i></div>
        <p class="load-count mono" id="lc"></p>
        <ol class="lsteps" id="st" aria-live="polite">${stages.map((s, i) => `<li><span class="mk"><b>${i + 1}</b>${icon('check')}</span><span>${s}</span></li>`).join('')}</ol>
        <p class="t3 load-note">Your answers are saved, so you can come back if anything fails.</p>
      </div>
      <div class="load-main">
        <div class="load-net" id="ln"></div>
        <section class="load-wait" id="lw" aria-label="While you wait">
          <div class="lw-fact"><p class="mono t3 lw-k" id="lwk">While you wait</p><p class="lw-v" id="lwv">Looking up today’s openings for ${esc(target || 'your role')}…</p><div class="lw-dots" id="lwd"></div></div>
          <div class="lw-new"><p class="mono t3 lw-k">Newest for ${esc(target || 'you')}</p><ul id="lwn"><li><span>Loading…</span></li></ul></div>
        </section>
      </div>
    </div></div>`;

  const root = $('.loading'), lis = $$('#st li'), bar = $('#lb'), count = $('#lc');
  let i = 0, net = null;
  const show = () => {
    lis.forEach((l, k) => { l.classList.toggle('done', k < i); l.classList.toggle('on', k === i); });
    bar.style.width = `${((i + 0.5) / lis.length) * 100}%`;
    bar.parentElement.setAttribute('aria-valuenow', String(i + 1));
    count.textContent = `Step ${i + 1} of ${lis.length}`;
  };
  show();
  import('./people.js').then(m => m.loadingNet($('#ln'), c)).then(n => { net = n; net.stage(0); }).catch(() => { const el = $('#ln'); if (el) el.hidden = true; });

  // elapsed time, so it is plain the work is still going
  const t0 = Date.now(), lt = $('#lt');
  const clock = setInterval(() => { if (!root.isConnected) return clearInterval(clock); const s = Math.round((Date.now() - t0) / 1000); lt.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  const tick = setInterval(() => { if (!root.isConnected) return clearInterval(tick); if (i < lis.length - 1) { i++; show(); net?.stage(i); } }, 6000);

  // while you wait: live facts about the target role, one at a time
  let rotate = null;
  if (!target) $('#lw').hidden = true;
  else api('/api/market?q=' + encodeURIComponent(target)).then(m => {
    if (!root.isConnected) return;
    const facts = factsFrom(m, target), wait = $('#lw');
    if (!facts.length) { wait.hidden = true; return; }
    $('#lwn').innerHTML = (m.postings || []).slice(0, 3).map(p => `<li><b>${esc(p.title)}</b><span>${esc([p.company, p.location].filter(Boolean).join(' · '))}</span></li>`).join('')
      || '<li><span>New openings appear here as they are collected</span></li>';
    let f = 0;
    const dots = $('#lwd');
    dots.innerHTML = facts.map((_, k) => `<i data-k="${k}"></i>`).join('');
    const paint = () => {
      const card = $('.lw-fact', wait);
      card.classList.remove('lw-show'); void card.offsetWidth; card.classList.add('lw-show');
      $('#lwk').textContent = facts[f].k; $('#lwv').innerHTML = facts[f].v;
      $$('i', dots).forEach((d, k) => d.classList.toggle('on', k === f));
    };
    paint();
    rotate = setInterval(() => { if (!root.isConnected) return clearInterval(rotate); f = (f + 1) % facts.length; paint(); }, 5000);
  }).catch(() => { const w = $('#lw'); if (w) w.hidden = true; });

  return async ok => {
    clearInterval(tick); clearInterval(clock); clearInterval(rotate);
    if (ok) { i = lis.length; lis.forEach(l => { l.classList.remove('on'); l.classList.add('done'); }); bar.style.width = '100%'; count.textContent = 'Done'; net?.finish(); await new Promise(r => setTimeout(r, 700)); }
  };
}
