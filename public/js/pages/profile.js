// Profile: everything the analysis and job matching use, on one page, with a completeness meter.
import { S, $, $$, app, esc, icon, toast, signedIn } from '../core.js';
import { loadCareer, saveCareer, completeness, STATUS_LABEL } from '../career.js';
import { SECTIONS } from '../career-form.js';

const PARTS = [
  ['now', 'Where you are now', 'Your situation decides what we score: your current work, or the work you are aiming for.'],
  ['skills', 'Skills, tools and projects', 'Levels matter: “Learning” counts half towards readiness, “Can use” and “Strong” count fully.'],
  ['edu', 'Education', ''],
  ['goal', 'What you are looking for', 'Used for job matches, “near you” counts and recommendations.'],
  ['plan', 'Learning plan defaults', 'Used for every new plan. You can change them for one analysis.'],
];

export default async function profile() {
  if (S.fb && !S.fb.isReady()) { app().innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  const C = loadCareer();
  let dirty = false;
  const persist = () => { dirty = true; localStorage.setItem('willai.career', JSON.stringify(C)); meter(); $('#psave').disabled = false; };
  const name = S.profile?.name || S.user?.displayName || '';
  app().innerHTML = `<div class="enter profile-page">
    <header class="page-h"><div><h1>${esc(name ? `${name.split(' ')[0]}’s profile` : 'Your profile')}</h1>
      <p>${signedIn() ? 'Saved to your account and used for every analysis and job match.' : 'Saved on this device. <a href="#/signin?next=%23%2Fprofile">Sign in</a> to keep it everywhere.'}</p></div>
      <div class="meter" id="meter"></div></header>
    <div class="profile-grid">
      <nav class="side-nav" aria-label="Profile sections">${PARTS.map(([k, t]) => `<a href="#p-${k}" data-sec="${k}">${esc(t)}</a>`).join('')}<a href="#p-search" data-sec="search">Job search details</a></nav>
      <form id="pf" class="stack">
        ${PARTS.map(([k, t, s]) => `<section class="card" id="p-${k}"><h2>${esc(t)}</h2>${s ? `<p class="sub">${esc(s)}</p>` : ''}<div class="wz-fields" data-part="${k}">${SECTIONS[k].html(C)}</div></section>`).join('')}
        <section class="card" id="p-search"><h2>Job search details</h2><p class="sub">Only you see these. They help you compare offers.</p>
          <div class="grid2"><div><label class="f" for="c-expectedSalary">Expected pay <span>optional</span></label><input class="in" id="c-expectedSalary" maxlength="40" placeholder="₹8–10 LPA" value="${esc(C.expectedSalary || '')}"></div>
            <div><label class="f" for="c-noticePeriod">Notice period <span>optional</span></label><input class="in" id="c-noticePeriod" maxlength="40" placeholder="30 days, immediate" value="${esc(C.noticePeriod || '')}"></div></div></section>
        <div class="sticky-save"><button class="btn pri" id="psave" disabled>Save profile</button><button type="button" class="btn" id="prun">Analyse with this profile</button><span id="pmsg" class="t3" style="font-size:13px"></span></div>
      </form>
    </div></div>`;
  for (const [k] of PARTS) SECTIONS[k].bind($(`[data-part="${k}"]`), C, persist);
  ['expectedSalary', 'noticePeriod'].forEach(k => $('#c-' + k).oninput = e => { C[k] = e.target.value; persist(); });
  $$('.side-nav a').forEach(a => a.onclick = e => { e.preventDefault(); $('#p-' + a.dataset.sec).scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  function meter() {
    const c = completeness(C);
    $('#meter').innerHTML = `<div class="m-top"><b>${c.pct}%</b><span>complete</span></div><div class="track"><i style="width:${c.pct}%"></i></div>
      ${c.missing.length ? `<p class="t3">Add: ${c.missing.slice(0, 3).map(esc).join(', ')}${c.missing.length > 3 ? '…' : ''}</p>` : '<p class="t3">Everything we use is here</p>'}`;
  }
  meter();
  const save = async () => {
    $('#psave').disabled = true;
    try { await saveCareer(C); dirty = false; $('#pmsg').textContent = signedIn() ? 'Saved to your account' : 'Saved on this device'; toast('Profile saved'); }
    catch (e) { $('#psave').disabled = false; toast(e.message); }
  };
  $('#pf').onsubmit = e => { e.preventDefault(); save(); };
  $('#prun').onclick = async () => { if (dirty) await save(); const { run } = await import('./home.js'); run(C); };
  addEventListener('hashchange', () => { if (dirty && signedIn()) saveCareer(C).catch(() => {}); }, { once: true });
}
