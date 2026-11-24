// The report: three numbers and three takeaways first, then six short chapters, each headline-first with detail on demand.
import { S, $, $$, app, esc, safeUrl, num, pct, icon, toast, level, date, signedIn, ranked } from '../core.js';
import { STATUS_LABEL } from '../career.js';
import { upgrade, ledger, ledgerKey, readinessWord } from '../report-cards.js';
import { jobRow, bindJobActions } from '../jobs-ui.js';
import { feedbackWidget } from '../feedback-ui.js';

const CHAPTERS = [['work', 'Your work'], ['gap', 'Your gap'], ['roles', 'Roles'], ['plan', 'Plan'], ['jobs', 'Jobs'], ['how', 'How we scored']];

export default async function report([id]) {
  let rep = JSON.parse(sessionStorage.getItem('willai.report') || 'null');
  if (id && (!rep || rep.id !== id)) {
    if (!S.fb) { location.hash = '#/'; return; }
    app().innerHTML = '<div class="loading"><h2>Opening your report</h2></div>';
    if (!S.fb.isReady()) await new Promise(res => { const off = S.fb.onUser(() => { off(); res(); }); });
    if (!S.user) { location.hash = '#/signin?next=' + encodeURIComponent('#/report/' + id); return; }
    const d = await S.fb.getReport(id).catch(() => null);
    if (!d) { app().innerHTML = '<div class="loading"><h2>Report not found</h2><a class="link" href="#/me">Your reports</a></div>'; return; }
    rep = { id, profile: d.profile, result: d.result, done: d.done || [], at: d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toISOString() : null };
    sessionStorage.setItem('willai.report', JSON.stringify(rep));
  }
  if (!rep) { location.hash = '#/'; return; }
  const { p, r } = upgrade(rep);
  const sc = r.scores, ex = sc.exposure, rd = sc.readiness, dm = sc.demand, m = r.market || {};
  const target = rd.target || p.target || p.role;
  const who = p.role || STATUS_LABEL[p.status];
  const done = new Set(rep.id ? rep.done || [] : JSON.parse(localStorage.getItem('willai.plan.' + (rep.at || '')) || '[]'));
  const allSteps = r.plan.flatMap((ph, i) => ph.steps.map((_, j) => `${i}.${j}`));
  const totalHours = r.plan.reduce((a, ph) => a + ph.steps.reduce((b, s) => b + (s.hours || 0), 0), 0);
  const evidence = { strong: 'Strong live evidence', partial: 'Some live evidence', thin: 'Little live evidence, mostly general knowledge' }[r.evidence_quality] || '';
  const subjectWork = ex.subject === 'target' ? `the work of a ${esc(target.toLowerCase())}` : 'your week';
  const skills = { has: [], partial: [], missing: [] };
  for (const row of rd.rows || []) skills[row.status].push(row);

  app().innerHTML = `<div class="enter report">
  <header class="rep-top">
    <p class="crumbs"><a href="#/">New analysis</a>${[STATUS_LABEL[p.status], p.years !== '' && p.years != null ? `${esc(p.years)} yrs` : '', [p.locations?.[0], p.country].filter(Boolean).join(', '), rep.at ? date(rep.at) : ''].filter(Boolean).map(x => ' · ' + esc(x)).join('')}</p>
    <h1>${esc(who)}${p.target && p.target !== p.role ? ` <span class="arrow">→</span> ${esc(p.target)}` : ''}</h1>
    <p class="headline">${esc(r.headline)}</p>
    <div class="glance" role="list">
      <a role="listitem" class="g" href="#how-exposure"><span class="k">AI exposure</span><b>${ex.value}</b><span class="w">${level(ex.value).toLowerCase()}</span><span class="d">Share of ${subjectWork} AI can do or speed up</span></a>
      ${rd.value != null ? `<a role="listitem" class="g" href="#how-readiness"><span class="k">Ready for ${esc(target)}</span><b>${rd.value}</b><span class="w">${readinessWord(rd.value)}</span><span class="d">Skills employers ask for that you already have</span></a>` : ''}
      ${dm.near != null ? `<a role="listitem" class="g" href="#jobs"><span class="k">Openings near you</span><b>${num(dm.near)}</b><span class="w">${num(dm.total)} in total</span><span class="d">${esc(target)}${dm.place ? ' · ' + esc(dm.place) : ''}${dm.modes?.length ? ' · ' + dm.modes.map(esc).join(', ') : ''}</span></a>`
        : dm.total != null ? `<a role="listitem" class="g" href="#jobs"><span class="k">Open now</span><b>${num(dm.total)}</b><span class="w">matching openings</span><span class="d">From today’s live postings</span></a>` : ''}
    </div>
    ${r.takeaways.length ? `<div class="remember"><p class="mono t3">remember three things</p><ol class="takeaways">${r.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : `<p class="verdict">${esc(r.summary)}</p>`}
  </header>

  <nav class="chapters" aria-label="Report chapters">${CHAPTERS.map(([k, l], i) => `<a href="#${k}" data-ch="${k}"><span>${i + 1}</span>${l}</a>`).join('')}</nav>

  <section class="chapter" id="work" tabindex="-1">
    <div class="ch-h"><span class="ch-n">1</span><div><h2>${ex.subject === 'target' ? `The work of a ${esc(target.toLowerCase())}` : 'Your work, task by task'}</h2>
      <p class="sub">${ex.subject === 'target' ? 'You are not in this role yet, so we score the work you are aiming for.' : 'Where your week goes, and how much of each task AI can already do.'}</p></div></div>
    ${ledger(ex.rows)}${ledgerKey()}
    <div class="cols">
      <div class="card"><h3 class="card-h">Task by task</h3><div class="tasklist">${r.tasks.map((t, i) => `<details class="tk" data-t="${i}"><summary>
          <span class="tk-dot ${esc(t.category)}-c"></span><span class="tk-name"><b>${esc(t.short)}</b>${esc(t.headline)}</span><span class="tk-pct mono">${t.exposure}%</span>${icon('down')}</summary>
          <p>${esc(t.detail)}</p></details>`).join('')}</div></div>
      <div class="card"><h3 class="card-h">What stays with you</h3><p class="sub">The parts employers keep paying a person for</p>
        <div class="tasklist">${r.human_edge.map(h => h.detail ? `<details class="tk"><summary><span class="tk-dot human-c"></span><span class="tk-name">${esc(h.headline)}</span>${icon('down')}</summary><p>${esc(h.detail)}</p></details>` : `<div class="tk plain"><span class="tk-dot human-c"></span><span class="tk-name">${esc(h.headline)}</span></div>`).join('')}</div>
        ${r.exposure_2030 != null ? `<p class="mono t3" style="margin-top:16px">${r.exposure_2030} projected by 2030</p>` : ''}</div>
    </div>
  </section>

  <section class="chapter" id="gap" tabindex="-1">
    <div class="ch-h"><span class="ch-n">2</span><div><h2>Your gap for ${esc(target)}</h2><p class="sub">${rd.rows?.length ? `The skills ${num(rd.postings)} live openings ask for, most asked first` : 'The skills to build next'}</p></div></div>
    ${rd.rows?.length ? `<div class="readiness"><div class="rbar" role="img" aria-label="Readiness ${rd.value} of 100">${rd.rows.map(x => `<i class="${x.status}" style="flex:${x.weight}" title="${esc(x.skill)}: asked in ${x.asked_in}% of openings"></i>`).join('')}</div>
      <div class="rkey"><span><i class="has"></i>You have it</span><span><i class="partial"></i>Partly</span><span><i class="missing"></i>Missing</span></div></div>
    <div class="skillcols">${[['missing', 'Missing', 'Learn these first'], ['partial', 'Partly there', 'Practise until you can show it'], ['has', 'You have', 'Put these on your CV']].map(([k, l, s]) => `<div><h3 class="card-h">${l} <span class="mono t3">${skills[k].length}</span></h3><p class="sub">${s}</p>
      <ul class="skillchips">${skills[k].map(x => `<li class="${k}"><span>${esc(x.skill)}</span><span class="mono">${x.asked_in}%</span></li>`).join('') || '<li class="none">None</li>'}</ul></div>`).join('')}</div>` : ''}
    <div class="card" style="margin-top:24px"><h3 class="card-h">Skills to learn next</h3><p class="sub">In order of impact for the roles below</p>
      <ol class="learn">${r.skills_to_learn.map(k => `<li><b>${esc(k.skill)}</b>${k.hours ? `<span class="mono t3">~${k.hours} h</span>` : ''}${k.reason ? `<p>${esc(k.reason)}</p>` : ''}</li>`).join('')}</ol></div>
  </section>

  <section class="chapter" id="roles" tabindex="-1">
    <div class="ch-h"><span class="ch-n">3</span><div><h2>Roles you could move into</h2><p class="sub">Each one backed by openings that exist today</p></div></div>
    <div class="roles">${r.future_roles.map(fr => `<article class="role">
      <div class="role-h"><h3>${esc(fr.title)}</h3><span class="fit">fit ${fr.fit}</span></div>
      <div class="fitbar"><i style="width:${fr.fit}%"></i></div>
      ${fr.timeline ? `<p class="mono t3">${icon('clock')} ${esc(fr.timeline)}</p>` : ''}
      <p>${esc(fr.why)}</p>
      ${fr.gap?.length ? `<p class="gap"><b>Missing:</b> ${fr.gap.map(esc).join(', ')}</p>` : ''}
      <div class="openings">${(fr.evidence || []).map(e => `<a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">${icon('ext')}<span>${esc(e.title)} · ${esc(e.company)}</span></a>`).join('')}
        <a href="#/jobs?q=${encodeURIComponent(fr.title)}">${icon('search')}<span>Search openings for this role</span></a></div>
    </article>`).join('')}</div>
  </section>

  <section class="chapter" id="plan" tabindex="-1">
    <div class="ch-h"><span class="ch-n">4</span><div><h2>Your ${r.planDays || p.planDays || 90}-day plan</h2>
      <p class="sub">${totalHours ? `About ${totalHours} hours in total, ${p.weeklyHours || ''}${p.weeklyHours ? ' hours a week' : ''}. ` : ''}${rep.id ? 'Progress is saved to your account.' : 'Progress is saved on this device. Sign in to keep it everywhere.'}</p></div>
      <div class="progress"><div class="track"><i id="pbar"></i></div><span id="ptxt" class="mono"></span></div></div>
    <ol class="timeline">${r.plan.map((ph, i) => `<li class="ph">
      <div class="ph-h"><span class="mono">${esc(ph.days)}</span><h3>${esc(ph.goal)}</h3></div>
      <div class="ph-steps">${ph.steps.map((st, j) => `<div class="pstep${done.has(`${i}.${j}`) ? ' done' : ''}">
        <button class="box" data-k="${i}.${j}" aria-pressed="${done.has(`${i}.${j}`)}" aria-label="Mark done: ${esc(st.action)}">${icon('check')}</button>
        <div class="pbody"><p class="tx">${esc(st.action)}</p>
          <p class="meta">${st.hours ? `<span>${icon('clock')}${st.hours} h</span>` : ''}${st.deliverable ? `<span><b>Show:</b> ${esc(st.deliverable)}</span>` : ''}</p>
          ${st.resources?.length ? `<p class="res">${st.resources.map(rs => `<a href="${safeUrl(rs.url)}" target="_blank" rel="noopener noreferrer">${icon(rs.direct ? 'ext' : 'search')}${esc(rs.title)}${rs.provider ? `<span class="t3"> · ${esc(rs.provider)}</span>` : ''}${rs.free ? '' : '<span class="tagq">paid</span>'}</a>`).join('')}</p>` : ''}
        </div></div>`).join('')}</div></li>`).join('')}</ol>
  </section>

  <section class="chapter" id="jobs" tabindex="-1">
    <div class="ch-h"><span class="ch-n">5</span><div><h2>Openings for ${esc(target)}</h2><p class="sub">${esc(r.market_read)}</p></div></div>
    <div class="stats"><div class="stat"><p class="k">Near you</p><p class="v">${dm.near != null ? num(dm.near) : '–'}</p></div><div class="stat"><p class="k">Everywhere</p><p class="v">${num(m.count)}</p></div>
      <div class="stat"><p class="k">Posted in 30 days</p><p class="v">${m.lastMonth != null ? num(m.lastMonth) : '–'}</p></div><div class="stat"><p class="k">Remote or hybrid</p><p class="v">${pct((m.remoteShare || 0) + (m.hybridShare || 0))}</p></div></div>
    <div class="cols">
      <div><div class="joblist" id="rep-jobs">${(m.postings || []).slice(0, 8).map(jobRow).join('') || '<p class="empty">No matching openings in our sources right now</p>'}
        <div class="more-row"><span>${dm.near ? `Showing roles near you first` : 'Every opening for this work'}</span><a class="link" href="#/jobs?q=${encodeURIComponent(target)}${p.locations?.[0] ? '&city=' + encodeURIComponent(p.locations[0]) : ''}">Open jobs for ${esc(target.toLowerCase())}</a></div></div>
        <div id="foryou"></div></div>
      <div class="stack"><section class="card"><h3 class="card-h">Who is hiring</h3><p class="sub">Companies with the most matching openings</p>${ranked(m.companies, 8)}</section>
        ${m.locations?.length ? `<section class="card"><h3 class="card-h">Where</h3><p class="sub">Cities with the most openings</p>${ranked(m.locations, 6)}</section>` : ''}</div>
    </div>
  </section>

  <section class="chapter" id="how" tabindex="-1">
    <div class="ch-h"><span class="ch-n">6</span><div><h2>How we scored</h2><p class="sub">The AI describes the work and maps your skills. The numbers are then worked out from that and from live postings, like this.</p></div></div>
    <div class="cols">
      <div class="card" id="how-exposure"><h3 class="card-h">AI exposure = ${ex.value}</h3><p class="sub">Each task’s share of ${subjectWork} × how much of it AI can do, added up${ex.legacy ? ' (older report: tasks weighted equally)' : ''}</p>
        <table class="maths"><thead><tr><th>Task</th><th>Share</th><th>AI can do</th><th>Adds</th></tr></thead>
          <tbody>${ex.rows.map(x => `<tr><td><i class="tk-dot ${esc(x.category)}-c"></i>${esc(x.short || x.task)}</td><td>${x.share}%</td><td>${x.exposure}%</td><td>${x.contribution}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td>${ex.value}</td></tr></tfoot></table></div>
      <div class="card" id="how-readiness">${rd.rows?.length ? `<h3 class="card-h">Readiness = ${rd.value}</h3><p class="sub">Weight = how often ${num(rd.postings)} openings for ${esc(target)} ask for the skill. You get full credit for skills you have, half for partly.</p>
        <table class="maths"><thead><tr><th>Skill</th><th>Asked in</th><th>Weight</th><th>You</th><th>Adds</th></tr></thead>
          <tbody>${rd.rows.map(x => `<tr><td>${esc(x.skill)}</td><td>${x.asked_in}%</td><td>${x.weight}</td><td class="st ${x.status}">${{ has: 'have', partial: 'partly', missing: 'missing' }[x.status]}${x.source === 'inferred' ? '*' : ''}</td><td>${x.contribution}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td>${rd.value}</td></tr></tfoot></table>
        <p class="mono t3" style="margin-top:8px">* worked out from your projects and experience, not your skill list</p>` : '<h3 class="card-h">Readiness</h3><p class="sub">Not enough live postings for this target to weigh skills.</p>'}</div>
    </div>
    <p class="note" style="margin-top:24px">Exposure measures how much of a task AI can do or speed up, not whether a job disappears. ${esc(evidence)}. ${num(r.used_postings)} openings were read for this report${r.collectedAt ? `, collected ${date(r.collectedAt)}` : ''}. Written by ${esc(r.model || 'AI')}; AI can be wrong, so check what matters to you.</p>
  </section>

  <section class="chapter fb-wrap" id="feedback-sec"><div id="fb"></div>
    <div class="save-row">${rep.id ? '<a class="btn sm" href="#/me">All your reports</a>' : S.fb ? `<button class="btn sm" id="keep">${signedIn() ? 'Save report' : 'Sign in to save'}</button>` : ''}<button class="btn sm" id="print">Print or save as PDF</button></div></section>
  </div>`;

  // progress
  const upd = () => { $('#pbar').style.width = (allSteps.length ? (done.size / allSteps.length) * 100 : 0) + '%'; $('#ptxt').textContent = `${done.size} of ${allSteps.length}`; };
  upd();
  $$('.pstep .box').forEach(b => b.onclick = () => {
    const k = b.dataset.k; done.has(k) ? done.delete(k) : done.add(k);
    b.closest('.pstep').classList.toggle('done'); b.setAttribute('aria-pressed', String(done.has(k))); upd();
    rep.done = [...done]; sessionStorage.setItem('willai.report', JSON.stringify(rep));
    if (rep.id && S.fb) S.fb.setDone(rep.id, rep.done).catch(() => toast('Could not save progress'));
    else localStorage.setItem('willai.plan.' + (rep.at || ''), JSON.stringify(rep.done));
  });
  // ledger ↔ task list
  const hi = i => { $$('#lg .seg, .ledger2-labels span').forEach(s => s.classList.toggle('dim', i != null && s.dataset.t !== String(i))); $$('#work .tk[data-t]').forEach(t => t.classList.toggle('hl', t.dataset.t === String(i))); };
  $$('#lg .seg').forEach(s => { s.onmouseenter = s.onfocus = () => hi(s.dataset.t); s.onmouseleave = s.onblur = () => hi(null); s.onclick = () => { const d = $(`#work details[data-t="${s.dataset.t}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }; });
  // chapter nav highlights the section in view
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) $$('.chapters a').forEach(a => a.classList.toggle('on', a.dataset.ch === e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
  $$('.chapter[id]').forEach(s => io.observe(s));
  $$('.chapters a, .glance a').forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  bindJobActions(m.postings || []);
  $('#print').onclick = () => { $$('details').forEach(d => (d.open = true)); print(); };
  const keep = $('#keep');
  if (keep) keep.onclick = async () => {
    if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent('#/report'); return; }
    keep.disabled = true;
    try { rep.id = await S.fb.saveReport(rep.profile, rep.result); await S.fb.setDone(rep.id, [...done]); sessionStorage.setItem('willai.report', JSON.stringify(rep)); location.hash = '#/report/' + rep.id; toast('Saved'); }
    catch (e) { keep.disabled = false; toast(e.message); }
  };
  feedbackWidget($('#fb'), { rep, p, r });
  if (signedIn()) import('../jobs-ui.js').then(mod => mod.forYou?.($('#foryou'), { profile: p, limit: 5, title: 'Picked for you' }));
  import('../people.js').then(mod => mod.mountYourMap?.($('#gap'), { p, r })).catch(() => {});
}
