// Your reports, plan progress, saved jobs and job matches in one place.
import { S, $, $$, app, esc, icon, toast, ago, safeUrl, signedIn } from '../core.js';
import { loadCareer, completeness, describeShort } from '../career.js';
import { upgrade } from '../report-cards.js';
import { forYou } from '../jobs-ui.js';

export default async function me() {
  if (!S.fb) { location.hash = '#/'; return; }
  if (!S.fb.isReady()) { app().innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent('#/me'); return; }
  const name = S.profile?.name || S.user.displayName || '';
  const c = loadCareer(), comp = completeness(c);
  app().innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>${esc(name || 'Your account')}</h1><p>${esc(describeShort(c))}${S.profile?.role === 'employer' ? ` · Employer${S.profile.company ? ', ' + esc(S.profile.company) : ''}` : ''}</p></div>
      <div class="ask-foot"><a class="btn" href="#/profile">${icon('user')}Profile · ${comp.pct}%</a><a class="btn" href="#/settings">${icon('gear')}Settings</a><a class="btn pri" href="#/">New analysis</a></div></header>
    <div class="cols" style="margin-top:0">
      <section class="card"><h2>Your reports</h2><p class="sub">Every analysis you run while signed in, with plan progress</p><ul class="rowlist" id="reps"><li class="t3">Loading</li></ul></section>
      <div class="stack">
        <section class="card"><h2>Saved jobs</h2><p class="sub">Openings you bookmarked</p><ul class="rowlist" id="sj"><li class="t3">Loading</li></ul></section>
        <section id="fy"></section>
      </div>
    </div></div>`;
  const [reps, saved] = await Promise.all([S.fb.listReports().catch(() => []), S.fb.listSaved().catch(() => [])]);
  $('#reps').innerHTML = reps.length ? reps.map(rep => {
    const { p, r } = upgrade(rep);
    const steps = r.plan.reduce((a, ph) => a + ph.steps.length, 0), done = (rep.done || []).length;
    return `<li><div style="min-width:0"><a href="#/report/${esc(rep.id)}" style="color:var(--t1);font-weight:500">${esc(p.role || p.target || 'Analysis')}${p.target && p.target !== p.role ? ' → ' + esc(p.target) : ''}</a>
      <div class="mini-progress"><i style="width:${steps ? (done / steps) * 100 : 0}%"></i></div>
      <span class="mono t3">exposure ${r.scores.exposure.value}${r.scores.readiness.value != null ? ` · ready ${r.scores.readiness.value}` : ''} · plan ${done} of ${steps} · ${ago(rep.createdAt)}</span></div>
      <span class="r"><a class="btn sm" href="#/report/${esc(rep.id)}">Open</a><button class="icon-btn" data-delrep="${esc(rep.id)}" title="Delete" aria-label="Delete report">${icon('trash')}</button></span></li>`;
  }).join('') : '<li class="t3">No reports yet. <a href="#/">Analyse your job</a></li>';
  $('#sj').innerHTML = saved.length ? saved.map(s => `<li><div style="min-width:0"><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--t1);font-weight:500">${esc(s.title)}</a><br><span class="mono t3">${esc(s.company)} · saved ${ago(s.savedAt)}</span></div>
      <span class="r"><a class="btn sm" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Apply</a><button class="icon-btn" data-unsave="${esc(s.key)}" title="Remove" aria-label="Remove saved job">${icon('trash')}</button></span></li>`).join('') : '<li class="t3">Nothing saved yet. <a href="#/jobs">Browse jobs</a></li>';
  $$('[data-delrep]').forEach(b => b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; toast('Click again to delete'); setTimeout(() => (b.dataset.armed = ''), 3000); return; }
    await S.fb.deleteReport(b.dataset.delrep).catch(e => toast(e.message)); await S.fb.unshareReport(b.dataset.delrep).catch(() => {}); me();
  });
  $$('[data-unsave]').forEach(b => b.onclick = async () => { await S.fb.unsaveJob(b.dataset.unsave).catch(e => toast(e.message)); S.saved.delete(b.dataset.unsave); me(); });
  if (c.skills.length || c.target) forYou($('#fy'), { profile: c, limit: 5, title: 'New matches for you' }).then(() => $('#fy .foryou')?.insertAdjacentHTML('beforeend', '<p style="margin-top:12px;font-size:14px"><a href="#/jobs?tab=foryou">See all matches</a></p>'));
  else $('#fy').innerHTML = `<div class="card"><h2>Job matches</h2><p class="sub">Add your skills and target role to your <a href="#/profile">profile</a> to see matches here.</p></div>`;
}
