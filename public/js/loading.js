// While the analysis runs: your skills light up and signals travel to role families and companies, stage by stage.
import { S, $, $$, app, esc, num, icon } from './core.js';
import { describeShort, hasRole } from './career.js';

export function showLoading(c) {
  const target = c.target || c.role;
  const stages = ['Reading your profile', `Searching ${S.trends ? num(S.trends.total) : 'today’s'} openings`, `Matching your skills to ${target ? esc(target.toLowerCase()) : 'roles'}`,
    hasRole(c) ? 'Splitting your work into tasks' : `Splitting ${esc((target || 'the role').toLowerCase())} into tasks`, 'Finding roles you could move into', `Writing your ${c.planDays}-day plan`];
  app().innerHTML = `<div class="loading wide enter"><p class="mono t3">${esc(describeShort(c))}</p><h2>Building your report</h2>
    <div class="load-net" id="ln"></div>
    <ul class="steps" id="st" aria-live="polite">${stages.map(s => `<li>${icon('check')}<span>${s}</span></li>`).join('')}</ul>
    <p class="t3" style="font-size:13px;margin-top:16px">This takes about a minute. Your answers are saved, so you can come back if it fails.</p></div>`;
  const lis = $$('#st li'); let i = 0, net = null;
  lis[0].classList.add('on');
  import('./people.js').then(m => m.loadingNet($('#ln'), c)).then(n => { net = n; net.stage(0); }).catch(() => { const el = $('#ln'); if (el) el.hidden = true; });
  const tick = setInterval(() => { if (i < lis.length - 1) { lis[i].classList.replace('on', 'done'); lis[++i].classList.add('on'); net?.stage(i); } }, 6000);
  return async ok => {
    clearInterval(tick);
    if (ok) { lis.forEach(l => { l.classList.remove('on'); l.classList.add('done'); }); net?.finish(); await new Promise(r => setTimeout(r, 700)); }
  };
}
