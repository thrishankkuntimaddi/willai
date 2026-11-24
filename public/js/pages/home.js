// Home: the headline beside the five-step analyse cycle (both above the fold), real reports below, then the people map.
import { S, $, $$, app, esc, num, icon, api, toast, data, signedIn } from '../core.js';
import { hasRole, loadCareer, saveCareer, describeShort } from '../career.js';
import { SECTIONS } from '../career-form.js';
import { previewCard, sharedCarousel } from '../report-cards.js';

const STEPS = [
  { id: 'now', title: 'Where you are now', short: 'Now' },
  { id: 'skills', title: 'What you know', short: 'Skills' },
  { id: 'edu', title: 'Education', short: 'Education' },
  { id: 'goal', title: 'Where you want to go', short: 'Goal' },
  { id: 'plan', title: 'Your plan', short: 'Plan' },
];
let step = 0, C = null, saveT;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem('willai.career', JSON.stringify(C)), 250); };

export default async function home() {
  C = loadCareer();
  const t = S.trends;
  app().innerHTML = `<section class="hero enter">
    <div class="hero-copy">
      <h1>See what AI changes in your tech career, and the fastest way forward</h1>
      <p class="lede">Working, fresher, student or back from a break: tell us where you are. We compare you with <b id="lede-n">${t ? num(t.total) + ' live openings' : 'today’s openings'}</b> and build a plan with real resources, for 30 days or 6 months.</p>
    </div>
    <form class="wizard" id="wz" novalidate aria-label="Build your report">
      <ol class="wz-steps" id="wz-steps"></ol>
      <div class="wz-body" id="wz-body"></div>
      <div id="wz-err" role="alert"></div>
      <div class="wz-foot"><button type="button" class="btn" id="wz-back">${icon('left')}Back</button><span class="mono t3" id="wz-count"></span><button class="btn pri" id="wz-next"></button></div>
    </form>
  </section>
  <section id="preview" class="home-reports" aria-label="Reports"></section>
  <section class="people-band" id="people" aria-label="People moving through tech right now"></section>`;
  document.addEventListener('willai:trends', () => { const el = $('#lede-n'); if (el && S.trends) el.textContent = num(S.trends.total) + ' live openings'; }, { once: true });
  drawStep();
  $('#wz-back').onclick = () => { if (step > 0) { step--; drawStep(true); } };
  $('#wz').onsubmit = e => { e.preventDefault(); next(); };
  side();
  import('../people.js').then(m => m.mountPeople($('#people'))).catch(e => console.warn('people map', e));
}

function next() {
  const err = validate(step);
  $('#wz-err').innerHTML = err ? `<p class="err">${esc(err)}</p>` : '';
  if (err) return;
  if (step < STEPS.length - 1) { step++; drawStep(true); return; }
  run(C);
}
function validate(i) {
  const s = STEPS[i].id;
  if (s === 'now') {
    if (hasRole(C) && C.status !== 'gap' && C.role.trim().length < 2) return 'Tell us your current role.';
    if (C.status === 'gap' && !C.role.trim() && !C.target.trim()) return 'Tell us your last role, or skip to the role you want.';
  }
  if (s === 'skills' && C.skills.length + C.technologies.length === 0) return 'Add at least one skill, even one you are still learning.';
  if (s === 'goal' && !hasRole(C) && C.target.trim().length < 2) return 'Pick the role you want. Start typing to see live titles.';
  return null;
}

function drawStep(focus) {
  $('#wz-steps').innerHTML = STEPS.map((s, i) => `<li><button type="button" class="${i === step ? 'on' : i < step ? 'done' : ''}" data-go="${i}" ${i > step ? 'disabled' : ''} aria-current="${i === step ? 'step' : 'false'}">
    <span class="n">${i < step ? icon('check') : i + 1}</span><span class="l">${esc(s.short)}</span></button></li>`).join('');
  $$('#wz-steps [data-go]').forEach(b => b.onclick = () => { step = +b.dataset.go; drawStep(true); });
  $('#wz-count').textContent = `${step + 1} of ${STEPS.length}`;
  $('#wz-back').hidden = step === 0;
  $('#wz-next').innerHTML = step === STEPS.length - 1 ? 'Build my report' : `Next${icon('right')}`;
  $('#wz-err').innerHTML = '';
  const body = $('#wz-body');
  const sec = SECTIONS[STEPS[step].id];
  body.innerHTML = `<h2 class="wz-h">${esc(STEPS[step].title)}</h2><div class="wz-fields">${sec.html(C)}</div>`;
  sec.bind(body, C, persist);
  body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  if (focus) body.querySelector('input,textarea,button')?.focus({ preventScroll: true });
}

/* ---------------- right column: real reports ---------------- */
async function side() {
  const el = $('#preview');
  if (!el) return;
  const mine = signedIn() && S.fb ? await S.fb.listReports().catch(() => []) : [];
  const shared = S.fb ? (await S.fb.listShared(40)).filter(r => r.rating >= 4) : [];
  if (!$('#preview')) return;
  if (mine[0]) el.innerHTML = previewCard({ profile: mine[0].profile, result: mine[0].result, id: mine[0].id, at: mine[0].createdAt }, { mine: true });
  if (shared.length) el.insertAdjacentHTML('beforeend', sharedCarousel(shared, { compact: !!mine[0] }));
  if (!mine[0] && !shared.length) el.innerHTML = `<article class="preview how"><p class="mono t3">what you get</p>
    <h3>Three numbers, worked out in the open</h3>
    <ol class="how-list"><li><b>AI exposure</b><span>Each task you do × how much of it AI can do, weighted by your time</span></li>
      <li><b>Readiness for your target</b><span>The skills live openings ask for, weighted by how often, against yours</span></li>
      <li><b>Openings near you</b><span>Live roles for your target in your cities and work mode</span></li></ol>
    <p class="t2" style="font-size:14px">Then roles you can reach, the skills to close the gap, and a day-by-day plan with free resources. Every report shows its own maths.</p></article>`;
  bindCarousel(el);
}
function bindCarousel(el) {
  const track = $('.carousel-track', el);
  if (!track) return;
  const cards = $$('.shared', track); let i = 0;
  const show = n => { i = (n + cards.length) % cards.length; cards.forEach((c, k) => { c.hidden = k !== i; }); $('.carousel-n', el).textContent = `${i + 1} of ${cards.length}`; };
  $('[data-prev]', el).onclick = () => show(i - 1);
  $('[data-next]', el).onclick = () => show(i + 1);
  show(0);
}

/* ---------------- run the analysis ---------------- */
export async function run(c) {
  await saveCareer(c).catch(e => console.warn('save career', e));
  const { showLoading } = await import('../loading.js');
  const stop = showLoading(c);
  try {
    const result = await api('/api/advise', { json: payload(c) });
    const rep = { profile: c, result, at: new Date().toISOString(), done: [] };
    if (S.fb && signedIn()) { try { rep.id = await S.fb.saveReport(c, result); } catch (e) { console.warn(e); } }
    sessionStorage.setItem('willai.report', JSON.stringify(rep));
    await stop(true);
    location.hash = rep.id ? '#/report/' + rep.id : '#/report';
  } catch (e) {
    await stop(false);
    step = STEPS.length - 1;
    await home();
    $('#wz-err').innerHTML = `<p class="err">${esc(e.message)}</p><p class="t2" style="font-size:14px;margin-top:8px">Your answers are kept. You can also <a href="#/jobs?q=${encodeURIComponent(c.target || c.role)}">browse open jobs for ${esc((c.target || c.role).toLowerCase())}</a>.</p>`;
  }
}
const payload = c => ({ ...c, years: c.years === '' ? null : +c.years, gapMonths: c.gapMonths === '' ? null : +c.gapMonths, gradYear: c.gradYear === '' ? null : +c.gradYear,
  education: c.education.filter(e => e.degree || e.field), projects: c.projects.filter(p => p.name) });
export { describeShort };
