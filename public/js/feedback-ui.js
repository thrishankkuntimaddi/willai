// Feedback: a rating, quick reasons, a note, and (for reports) an opt-in to share it anonymously.
import { S, $, $$, esc, icon, toast, signedIn } from './core.js';
import { shareCard } from './report-cards.js';

const REPORT_CHIPS = ['Score felt right', 'Score felt wrong', 'Plan is useful', 'Plan too generic', 'Jobs not relevant', 'Learned something new'];
const SITE_CHIPS = ['Something is broken', 'Missing jobs', 'Wrong job details', 'Idea for a feature', 'Hard to understand', 'Love it'];

export function feedbackWidget(el, { rep = null, p = null, r = null, page = 'report' } = {}) {
  const isReport = !!rep;
  if (!S.fb) { el.innerHTML = ''; return; }
  if (!signedIn()) {
    el.innerHTML = `<div class="card fb"><h3 class="card-h">${isReport ? 'Was this report useful?' : 'Send feedback'}</h3>
      <p class="sub">Sign in to rate it, tell us what to fix, or share it anonymously so others can learn from it.</p>
      <a class="btn sm" href="#/signin?next=${encodeURIComponent(location.hash)}">Sign in</a></div>`;
    return;
  }
  let rating = 0; const picked = new Set();
  const shareDefault = !!S.profile?.prefs?.shareByDefault;
  el.innerHTML = `<form class="card fb" id="fbf">
    <h3 class="card-h">${isReport ? 'Was this report useful?' : 'Tell us what to fix or build'}</h3>
    <p class="sub">${isReport ? 'Your rating teaches the next report. Good ones can help other people too.' : 'We read every note.'}</p>
    <div class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} of 5">${icon('star')}</button>`).join('')}</div>
    <div class="fbchips">${(isReport ? REPORT_CHIPS : SITE_CHIPS).map(c => `<button type="button" class="chipbtn" aria-pressed="false" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <textarea class="in" id="fbt" rows="2" maxlength="1000" placeholder="${isReport ? 'What would make it more useful? (optional)' : 'What happened, or what would help?'}" aria-label="Feedback"></textarea>
    ${isReport && rep.id ? `<label class="check"><input type="checkbox" id="fbshare" ${shareDefault ? 'checked' : ''}>Share this report anonymously on the home page <span class="t3">(no name, email or notes; you can remove it any time)</span></label>` : ''}
    <div class="ask-foot"><button class="btn pri sm" id="fbsend" disabled>Send</button><span id="fbmsg" class="t3" style="font-size:13px"></span></div>
  </form>`;
  const send = $('#fbsend', el);
  const ready = () => { send.disabled = !(rating || picked.size || $('#fbt', el).value.trim()); };
  $$('[data-star]', el).forEach(b => b.onclick = () => {
    rating = +b.dataset.star;
    $$('[data-star]', el).forEach(x => { const on = +x.dataset.star <= rating; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(+x.dataset.star === rating)); });
    ready();
  });
  $$('[data-chip]', el).forEach(b => b.onclick = () => { const c = b.dataset.chip; picked.has(c) ? picked.delete(c) : picked.add(c); b.setAttribute('aria-pressed', String(picked.has(c))); b.classList.toggle('on', picked.has(c)); ready(); });
  $('#fbt', el).oninput = ready;
  if (isReport && rep.id) S.fb.isShared(rep.id).then(on => { const c = $('#fbshare', el); if (c && on) { c.checked = true; c.closest('label').insertAdjacentHTML('beforeend', ' <span class="tagq">shared</span>'); } });
  $('#fbf', el).onsubmit = async e => {
    e.preventDefault(); send.disabled = true;
    try {
      await S.fb.sendFeedback({ rating: rating || 3, chips: [...picked], text: $('#fbt', el).value, reportId: rep?.id || null, page });
      const share = $('#fbshare', el);
      if (share) {
        if (share.checked && rating >= 1) await S.fb.shareReport(rep.id, shareCard(p, r, rating || 3));
        else if (!share.checked) await S.fb.unshareReport(rep.id).catch(() => {});
      }
      el.innerHTML = `<div class="card fb done"><h3 class="card-h">${icon('check')} Thank you</h3><p class="sub">${share?.checked ? 'Your report is shared anonymously. Remove it any time from Settings or by sending feedback again.' : 'We read every note.'}</p></div>`;
    } catch (er) { send.disabled = false; $('#fbmsg', el).textContent = er.message; toast('Could not send feedback'); }
  };
}
