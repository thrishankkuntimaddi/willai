// Pieces shared by the report page, the home page and the account page.
import { esc, num, level, date, icon } from './core.js';
import { STATUS_LABEL } from './career.js';

// Reports saved before v2 still open: map them onto the v2 shape.
export function upgrade(rep) {
  const r = rep.result || {}, p0 = rep.profile || {};
  if (r.version === 2) return { p: p0, r };
  const tasks = (r.tasks || []).map(t => ({ ...t, short: String(t.task).split(/\s+/).slice(0, 3).join(' '), share_of_week: 0, headline: t.task, detail: t.why || '' }));
  const n = tasks.length || 1;
  return {
    p: { status: 'working', role: p0.role || '', years: p0.years || '', dailyWork: p0.skills || '', skills: [], technologies: [], projects: [], education: p0.education ? [{ degree: p0.education, field: '', year: '' }] : [],
      target: p0.target || '', workModes: [], locations: [], country: p0.country || '', planDays: 90, weeklyHours: 8, budget: 'free', constraints: p0.constraints || '' },
    r: {
      version: 1, headline: String(r.verdict || '').split(/(?<=\.)\s/)[0], summary: r.verdict || '', takeaways: [], tasks,
      human_edge: (r.human_edge || []).map(h => ({ headline: h, detail: '' })), skill_map: [],
      future_roles: (r.future_roles || []).map(f => ({ ...f, timeline: '' })), skills_to_learn: (r.skills_to_learn || []).map(s => ({ ...s, hours: 0 })),
      plan: (r.plan || []).map(ph => ({ days: ph.days, goal: String(ph.phase || '').replace(/^\s*days?\s*\d+\s*[-–to]+\s*\d+\s*[:.\-–]\s*/i, ''), steps: ph.steps.map(s => ({ action: s, hours: 0, deliverable: '', resources: [] })) })),
      scores: { exposure: { value: r.exposure_score, subject: 'current', legacy: true, rows: tasks.map(t => ({ task: t.task, short: t.short, category: t.category, share: +(100 / n).toFixed(1), exposure: t.exposure, contribution: +(t.exposure / n).toFixed(1) })) },
        readiness: { value: null, rows: [] }, demand: { total: r.market?.count ?? null, near: null } },
      market: r.market || {}, market_read: r.market_read || '', evidence_quality: r.evidence_quality, exposure_2030: r.exposure_2030, model: r.model, used_postings: r.used_postings,
    },
  };
}

// Numbers from stored or shared reports go into markup and style attributes, so they are forced to be numbers first.
const n100 = v => Math.max(0, Math.min(100, Math.round(+v) || 0));
const nOrNull = v => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.round(+v));
const list = v => (Array.isArray(v) ? v : []);
const CATS = new Set(['automate', 'augment', 'human']);

/* The task bar: width = share of the week, dark fill = how much of that task AI can do. */
export function ledger(rows, { labels = true, id = 'lg' } = {}) {
  rows = list(rows).map(t => ({ ...t, share: Math.max(0, Math.min(100, +t.share || 0)), exposure: n100(t.exposure), category: CATS.has(t.category) ? t.category : 'augment' }));
  return `<div class="ledger2" id="${id}" role="list" aria-label="Your week, task by task">${rows.map((t, i) => `<div role="listitem" tabindex="0" class="seg ${esc(t.category)}" style="flex:${Math.max(t.share, 5)}" data-t="${i}"
      aria-label="${esc(t.task)}: ${t.share}% of the week; AI can do ${t.exposure}% of it"><i style="height:${t.exposure}%"></i><span class="pct">${t.exposure}%</span></div>`).join('')}</div>
    ${labels ? `<div class="ledger2-labels" aria-hidden="true">${rows.map((t, i) => `<span style="flex:${Math.max(t.share, 5)}" data-t="${i}"><b>${esc(t.short || t.task)}</b><i>${Math.round(t.share)}% of week</i></span>`).join('')}</div>` : ''}`;
}
export const ledgerKey = () => `<div class="ledger-key"><span><i class="keybox"></i>Width: share of your week</span><span><i class="keyfill"></i>Dark part: what AI can do</span>
  <span><i class="automate-c"></i>AI does most</span><span><i class="augment-c"></i>AI helps, you lead</span><span><i class="human-c"></i>Stays with you</span></div>`;

export const readinessWord = v => v == null ? '' : v >= 75 ? 'ready to apply' : v >= 50 ? 'close' : v >= 25 ? 'some way to go' : 'early days';

/* Compact card used on the home page (your latest report). */
export function previewCard(rep, { mine = false } = {}) {
  const { p, r } = upgrade(rep);
  const sc = r.scores || {}, ex = n100(sc.exposure?.value ?? r.exposure_score), ready = nOrNull(sc.readiness?.value);
  const who = p.role || STATUS_LABEL[p.status] || '';
  return `<article class="preview" aria-label="Your latest report">
    <div class="preview-h"><h3>${esc(who)}${p.target && p.target !== p.role ? ` <span class="t3">→</span> ${esc(p.target)}` : ''}</h3><span class="mono t3">${mine ? 'your latest' : ''}${rep.at ? ' · ' + date(rep.at) : ''}</span></div>
    <div class="trio">
      <div><b>${ex}</b><span>AI exposure</span></div>
      ${ready != null ? `<div><b>${ready}</b><span>Ready for ${esc(sc.readiness.target || 'target')}</span></div>` : ''}
      ${sc.demand?.near != null ? `<div><b>${num(sc.demand.near)}</b><span>Openings near you</span></div>` : sc.demand?.total != null ? `<div><b>${num(sc.demand.total)}</b><span>Open now</span></div>` : ''}
    </div>
    <p class="verdict">${esc(r.headline)}</p>
    ${ledger(sc.exposure?.rows || [], { labels: false, id: 'lg-prev' })}
    <ul class="roles-mini">${list(r.future_roles).slice(0, 3).map(f => `<li><span>${esc(f.title)}</span><span class="mono t3">fit ${n100(f.fit)}</span></li>`).join('')}</ul>
    <p style="margin-top:16px;font-size:14px"><a href="#/report/${esc(rep.id || '')}">Open your report</a> · <a href="#/me">All reports</a></p>
  </article>`;
}

/* Anonymised card for sharing: only fields the rules allow, nothing identifying. */
export function shareCard(p, r, rating) {
  const sc = r.scores || {};
  const yrs = +p.years;
  return {
    role: String(p.role || STATUS_LABEL[p.status] || '').slice(0, 80), status: STATUS_LABEL[p.status] ? p.status : 'working',
    yearsBand: p.years === '' || p.years == null ? '' : yrs < 1 ? '<1 yr' : yrs <= 2 ? '1–2 yrs' : yrs <= 5 ? '3–5 yrs' : yrs <= 10 ? '6–10 yrs' : '10+ yrs',
    country: String(p.country || '').slice(0, 60), city: String(p.locations?.[0] || '').slice(0, 60), target: String(p.target || '').slice(0, 80), family: '',
    // whole numbers in range: the Firestore rules reject anything else
    exposure: n100(sc.exposure?.value), readiness: nOrNull(sc.readiness?.value) == null ? null : n100(sc.readiness.value),
    nearOpenings: nOrNull(sc.demand?.near) == null ? null : Math.max(0, nOrNull(sc.demand.near)),
    tasks: (sc.exposure?.rows || []).slice(0, 9).map(t => ({ short: String(t.short || '').slice(0, 40), category: t.category, exposure: t.exposure, share: t.share })),
    roles: (r.future_roles || []).slice(0, 5).map(f => ({ title: String(f.title).slice(0, 120), fit: f.fit })),
    planDays: Math.max(7, Math.min(365, Math.round(+(r.planDays || p.planDays)) || 90)), phases: (r.plan || []).slice(0, 6).map(ph => String(ph.goal || '').slice(0, 160)),
    takeaways: (r.takeaways || []).slice(0, 3).map(t => String(t).slice(0, 140)), rating: Math.max(1, Math.min(5, Math.round(+rating) || 1)),
  };
}

/* Carousel of reports other people shared anonymously. */
export function sharedCarousel(items, { compact = false } = {}) {
  return `<section class="carousel${compact ? ' compact' : ''}" aria-label="Reports shared anonymously">
    <div class="carousel-h"><span class="mono t3">shared anonymously by people on WillAI</span>
      <span class="carousel-nav"><button type="button" class="icon-btn" data-prev aria-label="Previous">${icon('left')}</button><span class="mono t3 carousel-n"></span><button type="button" class="icon-btn" data-next aria-label="Next">${icon('right')}</button></span></div>
    <div class="carousel-track">${list(items).map(s => ({ ...s, exposure: n100(s.exposure), readiness: nOrNull(s.readiness), nearOpenings: nOrNull(s.nearOpenings),
      rating: Math.max(0, Math.min(5, Math.round(+s.rating) || 0)), planDays: Math.max(7, Math.min(365, Math.round(+s.planDays) || 90)),
      tasks: list(s.tasks), roles: list(s.roles), takeaways: list(s.takeaways) })).map(s => `<article class="preview shared" hidden>
      <div class="preview-h"><h3>${esc(s.role)}${s.target && s.target !== s.role ? ` <span class="t3">→</span> ${esc(s.target)}` : ''}</h3><span class="mono t3">${'★'.repeat(s.rating)}</span></div>
      <p class="mono t3" style="margin-top:4px">${[STATUS_LABEL[s.status], s.yearsBand, s.city || s.country].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="trio"><div><b>${s.exposure}</b><span>AI exposure</span></div>${s.readiness != null ? `<div><b>${s.readiness}</b><span>Readiness</span></div>` : ''}${s.nearOpenings != null ? `<div><b>${num(s.nearOpenings)}</b><span>Openings near them</span></div>` : ''}</div>
      ${ledger(s.tasks.map(t => ({ ...t, task: t?.short })), { labels: !compact, id: 'lg-' + esc(s.id) })}
      ${s.takeaways?.length && !compact ? `<ol class="takeaways sm">${s.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
      <ul class="roles-mini">${s.roles.slice(0, 3).map(f => `<li><span>${esc(f?.title)}</span><span class="mono t3">fit ${n100(f?.fit)}</span></li>`).join('')}</ul>
      <p class="mono t3" style="margin-top:12px">${s.planDays}-day plan · ${level(s.exposure).toLowerCase()}</p>
    </article>`).join('')}</div></section>`;
}
