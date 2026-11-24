// Job rows, the job detail drawer (trust, skill match, similar roles, report), save/dismiss, and "For you" recommendations.
import { S, $, $$, esc, safeUrl, icon, toast, ago, api, signedIn, money, MODE_LABEL, SENIORITY_LABEL, TYPE_LABEL } from './core.js';
import { loadCareer } from './career.js';

const BY_ID = new Map();
const mySkills = () => new Set([...(loadCareer().skills || []).map(s => s.name), ...(loadCareer().technologies || [])].map(s => String(s).toLowerCase()));

export function trustBadge(t, { full = false } = {}) {
  if (!t) return '';
  const ic = { good: 'shield', ok: 'shield', warn: 'alert', bad: 'alert' }[t.level];
  if (!full && t.level === 'ok') return '';
  return `<span class="trust ${t.level}" title="${esc((t.reasons || []).join('. ') || t.label)}">${icon(ic)}${esc(t.label)}</span>`;
}

export function jobRow(j) {
  BY_ID.set(String(j.id), j);
  const key = S.fb ? S.fb.savedKey(j.id) : j.id, saved = S.saved.has(key), own = String(j.id).startsWith('willai:');
  const loc = j.location ? (j.location.length > 48 ? j.location.slice(0, 46).replace(/[,;\s]+[^,;]*$/, '') + ' and more' : j.location) : '';
  return `<div class="job${j.status && j.status !== 'active' ? ' old' : ''}" data-job="${esc(j.id)}">
    <h3><button type="button" class="jt" data-open="${esc(j.id)}">${esc(j.title)}</button></h3>
    <div class="acts">
      ${signedIn() && j.why ? `<button class="icon-btn" data-dismiss="${esc(j.id)}" title="Not for me" aria-label="Not for me">${icon('eyeoff')}</button>` : ''}
      <button class="icon-btn${saved ? ' on' : ''}" data-save="${esc(j.id)}" title="${saved ? 'Saved' : 'Save'}" aria-label="${saved ? 'Saved' : 'Save job'}" aria-pressed="${saved}">${icon('bookmark')}</button>
      <a class="btn sm" href="${safeUrl(j.url || j.applyUrl)}" target="_blank" rel="noopener noreferrer">Apply</a>
    </div>
    <p class="co"><span>${esc(j.company)}</span>${loc ? `<span>${icon('pin')} ${esc(loc)}</span>` : ''}
      ${MODE_LABEL[j.work_mode] ? `<span class="tagq">${MODE_LABEL[j.work_mode]}</span>` : j.remote ? '<span class="tagq">Remote</span>' : ''}
      ${SENIORITY_LABEL[j.seniority] ? `<span class="tagq">${SENIORITY_LABEL[j.seniority]}</span>` : ''}
      ${j.type && j.type !== 'full_time' ? `<span class="tagq">${esc(TYPE_LABEL[j.type] || j.type)}</span>` : ''}
      ${j.salary?.max ? `<span class="tagq">${esc(money(j.salary))}</span>` : typeof j.salary === 'string' && j.salary ? `<span class="tagq">${esc(j.salary)}</span>` : ''}
      ${own ? '<span class="tagq own">Posted on WillAI</span>' : ''}
      ${j.status === 'closed' ? '<span class="tagq">Closed</span>' : j.status === 'stale' ? '<span class="tagq">Older</span>' : ''}
      ${j.posted ? `<span class="mono t3">${ago(j.posted)}</span>` : ''}${trustBadge(j.trust)}</p>
    ${j.why ? `<p class="why">${esc(j.why)}</p>` : ''}
  </div>`;
}

export function bindJobActions(list, root = document) {
  for (const j of list) BY_ID.set(String(j.id), j);
  $$('[data-save]', root).forEach(b => b.onclick = async () => {
    if (!S.fb) return;
    if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent(location.hash); return; }
    const j = BY_ID.get(b.dataset.save); if (!j) return;
    const key = S.fb.savedKey(j.id);
    try {
      if (S.saved.has(key)) { await S.fb.unsaveJob(j.id); S.saved.delete(key); b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); toast('Removed from saved'); }
      else { await S.fb.saveJob({ ...j, url: j.url || j.applyUrl }); S.saved.add(key); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); toast('Saved'); }
    } catch (e) { toast(e.message); }
  });
  $$('[data-dismiss]', root).forEach(b => b.onclick = async () => {
    const j = BY_ID.get(b.dataset.dismiss); if (!j) return;
    try { await S.fb.dismissJob(j); S.dismissed.add(S.fb.savedKey(j.id)); b.closest('.job').remove(); toast('We will show fewer like this'); } catch (e) { toast(e.message); }
  });
  $$('[data-open]', root).forEach(b => b.onclick = () => openJob(b.dataset.open));
}

/* ---------------- detail drawer ---------------- */
const REASONS = ['Asks me to pay money', 'Company looks fake', 'Details are misleading', 'Job does not exist any more', 'Spam or duplicate', 'Something else'];
export async function openJob(id) {
  const base = BY_ID.get(String(id));
  let dlg = $('#drawer');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'drawer'; dlg.className = 'drawer'; document.body.append(dlg); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); }
  dlg.innerHTML = `<div class="dr-in"><p class="t3">Loading</p></div>`;
  if (!dlg.open) dlg.showModal();
  let j = base, similar = [];
  if (!String(id).startsWith('willai:')) {
    try { const d = await api('/api/job?id=' + encodeURIComponent(id)); j = d.job; similar = d.similar; } catch (e) { if (!base) { dlg.innerHTML = `<div class="dr-in"><p class="err">${esc(e.message)}</p><button class="btn sm" data-close>Close</button></div>`; $('[data-close]', dlg).onclick = () => dlg.close(); return; } }
  }
  similar.forEach(s => BY_ID.set(String(s.id), s));
  const mine = mySkills();
  const t = j.trust;
  dlg.innerHTML = `<div class="dr-in" role="document">
    <div class="dr-top"><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <p class="mono t3">${esc(j.company)}${j.category ? ' · ' + esc(j.category) : ''}</p>
    <h2>${esc(j.title)}</h2>
    <p class="co">${j.location ? `<span>${icon('pin')} ${esc(j.location)}</span>` : ''}${MODE_LABEL[j.work_mode] ? `<span class="tagq">${MODE_LABEL[j.work_mode]}</span>` : ''}
      ${SENIORITY_LABEL[j.seniority] ? `<span class="tagq">${SENIORITY_LABEL[j.seniority]}</span>` : ''}${j.type ? `<span class="tagq">${esc(TYPE_LABEL[j.type] || j.type)}</span>` : ''}
      ${j.salary?.max ? `<span class="tagq">${esc(money(j.salary))}</span>` : ''}${j.posted ? `<span class="mono t3">posted ${ago(j.posted)}</span>` : ''}</p>
    <div class="dr-acts"><a class="btn pri" href="${safeUrl(j.url || j.applyUrl)}" target="_blank" rel="noopener noreferrer">Apply on ${j.kind === 'ats' ? 'the company site' : 'the job site'}${icon('ext')}</a>
      <button class="btn" data-save="${esc(j.id)}">${icon('bookmark')}${S.fb && S.saved.has(S.fb.savedKey(j.id)) ? 'Saved' : 'Save'}</button></div>
    ${t ? `<section class="trustbox ${t.level}"><p>${trustBadge(t, { full: true })}</p>
      ${t.reasons?.length ? `<ul>${t.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="t2">${t.level === 'good' ? 'Listed on the company’s own careers board.' : 'We found no warning signs.'} Never pay to apply, and never share bank or ID details before an offer.</p>`}</section>` : ''}
    ${j.skills?.length ? `<section><h3 class="card-h">Skills in this posting</h3><p class="sub">${j.skills.filter(s => mine.has(s.toLowerCase())).length} of ${j.skills.length} match your profile</p>
      <ul class="skillchips">${j.skills.map(s => `<li class="${mine.has(s.toLowerCase()) ? 'has' : 'missing'}"><span>${mine.has(s.toLowerCase()) ? '✓ ' : ''}${esc(s)}</span></li>`).join('')}</ul></section>` : ''}
    ${j.snippet || j.description ? `<section><h3 class="card-h">About the role</h3><p class="dr-text">${esc(j.snippet || j.description)}${(j.snippet || '').length >= 1990 ? '…' : ''}</p></section>` : ''}
    ${similar.length ? `<section><h3 class="card-h">Similar openings</h3><div class="joblist">${similar.map(jobRow).join('')}</div></section>` : ''}
    <details class="report-job"><summary>${icon('flag')} Report this job</summary>
      ${signedIn() ? `<form id="rj"><div class="fbchips">${REASONS.map(x => `<label class="chipbtn"><input type="radio" name="why" value="${esc(x)}" required>${esc(x)}</label>`).join('')}</div>
        <textarea class="in" id="rjn" rows="2" maxlength="500" placeholder="What did you notice? (optional)"></textarea><button class="btn sm">Send report</button></form>`
        : `<p class="t2"><a href="#/signin?next=${encodeURIComponent(location.hash)}">Sign in</a> to report a job. Three reports from confirmed accounts hide it until we review it.</p>`}</details>
  </div>`;
  $('[data-close]', dlg).onclick = () => dlg.close();
  bindJobActions([j, ...similar], dlg);
  const rj = $('#rj', dlg);
  if (rj) rj.onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/api/jobs/report', { json: { id: j.id, reason: rj.why.value, note: $('#rjn', dlg).value } });
      rj.outerHTML = `<p class="t2">${icon('check')} Thanks. We will check it.${r.needsVerifiedEmail ? ' Confirm your email address so your reports count toward hiding a posting.' : ''}</p>`;
    }
    catch (er) { toast(er.message); }
  };
}

/* ---------------- "For you" ---------------- */
export async function forYou(el, { profile, limit = 10, title = 'For you' } = {}) {
  if (!el) return [];
  const c = profile || loadCareer();
  el.innerHTML = `<div class="foryou"><h3 class="card-h">${esc(title)}</h3><p class="sub">Matched to your skills, level, cities and how you want to work</p><div class="joblist"><p class="empty">Finding matches</p></div></div>`;
  try {
    const d = await api('/api/recommend', { json: { profile: c, dismissed: [...S.dismissed].slice(0, 200), limit: limit + 10 } });
    const items = d.items.filter(j => !S.dismissed.has(S.fb?.savedKey(j.id))).slice(0, limit);
    $('.joblist', el).innerHTML = items.map(jobRow).join('') || '<p class="empty">No close matches yet. Add skills and cities to your profile.</p>';
    bindJobActions(items, el);
    return items;
  } catch (e) { $('.joblist', el).innerHTML = `<p class="empty">${esc(e.message)}</p>`; return []; }
}
