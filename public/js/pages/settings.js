// Settings: account, defaults, privacy, and your data (download or delete everything).
import { S, $, $$, app, esc, icon, toast, signedIn, date } from '../core.js';
import { PLAN_LENGTHS } from '../career.js';
import { segmented } from '../forms.js';

export default async function settings() {
  if (!S.fb) { location.hash = '#/'; return; }
  if (!S.fb.isReady()) { app().innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  if (!signedIn()) { location.hash = '#/signin?next=' + encodeURIComponent('#/settings'); return; }
  const prefs = { defaultPlanDays: 90, shareByDefault: false, hideFlagged: true, techOnly: true, ...(S.profile?.prefs || {}) };
  const google = S.fb.providers().includes('google.com');
  app().innerHTML = `<div class="enter settings-page">
    <header class="page-h"><div><h1>Settings</h1><p>${esc(S.user.email || '')}</p></div></header>
    <div class="stack narrow">
      <section class="card"><h2>Account</h2><p class="sub">${google ? 'You sign in with Google.' : 'You sign in with email and password.'} Member since ${date(S.profile?.createdAt) || 'recently'}.</p>
        <form id="nf" class="row-form"><div style="flex:1"><label class="f" for="nm">Name</label><input class="in" id="nm" maxlength="120" value="${esc(S.profile?.name || S.user.displayName || '')}"></div><button class="btn">Save name</button></form>
        ${google ? '' : `<p style="margin-top:16px"><button class="link" id="pw">Send me a password reset link</button></p>`}
        <p style="margin-top:12px;font-size:14px"><a href="#/profile">Edit your career profile</a> · ${S.profile?.role === 'employer' ? `Employer account for ${esc(S.profile.company || 'your company')}` : '<a href="#/employers">Switch to an employer account to post jobs</a>'}</p></section>

      <section class="card"><h2>Defaults</h2><p class="sub">Used for new analyses and the Jobs page</p>
        <div class="setting"><div><b>Plan length</b><p>How long new plans should be</p></div><div id="pl"></div></div>
        <div class="setting"><div><b>Tech roles only</b><p>Start the Jobs page with technology roles</p></div><label class="switch"><input type="checkbox" id="tech" ${prefs.techOnly ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><div><b>Hide postings with scam warnings</b><p>You can still show them from the Jobs filters</p></div><label class="switch"><input type="checkbox" id="hf" ${prefs.hideFlagged ? 'checked' : ''}><span></span></label></div></section>

      <section class="card"><h2>Privacy</h2><p class="sub">Your reports are private unless you share one</p>
        <div class="setting"><div><b>Offer to share reports anonymously</b><p>Pre-ticks “share anonymously” when you rate a report. Shared cards never include your name, email or notes.</p></div><label class="switch"><input type="checkbox" id="share" ${prefs.shareByDefault ? 'checked' : ''}><span></span></label></div>
        <div id="shared" class="shared-list"></div></section>

      <section class="card"><h2>Your data</h2><p class="sub">Everything WillAI stores about you</p>
        <div class="setting"><div><b>Download your data</b><p>Your account, profile, reports, plan progress, saved jobs and feedback as a JSON file</p></div><button class="btn sm" id="exp">${icon('download')}Download</button></div>
        <div class="setting danger"><div><b>Delete your account</b><p>Removes your profile, reports, saved jobs, feedback and shared reports, then your sign-in. This cannot be undone.</p></div><button class="btn sm" id="del">Delete account</button></div>
        <form id="delf" hidden class="del-confirm">
          <p>Type <b>delete my account</b> to confirm.${google ? ' Google will ask you to sign in again.' : ''}</p>
          <input class="in" id="dc" autocomplete="off" aria-label="Confirmation">
          ${google ? '' : '<input class="in" id="dp" type="password" placeholder="Your password" autocomplete="current-password" aria-label="Password">'}
          <div class="ask-foot"><button class="btn pri" id="dgo" disabled>Delete everything</button><button type="button" class="link" id="dcancel">Cancel</button></div><div id="derr"></div></form></section>
    </div></div>`;

  const savePrefs = async () => { try { await S.fb.savePrefs(prefs); toast('Saved'); } catch (e) { toast(e.message); } };
  segmented($('#pl'), { options: PLAN_LENGTHS.map(d => ({ id: d, label: d < 180 ? `${d} d` : '6 mo' })), value: +prefs.defaultPlanDays, label: 'Plan length', onChange: v => { prefs.defaultPlanDays = v; savePrefs(); } });
  $('#tech').onchange = e => { prefs.techOnly = e.target.checked; savePrefs(); };
  $('#hf').onchange = e => { prefs.hideFlagged = e.target.checked; savePrefs(); };
  $('#share').onchange = e => { prefs.shareByDefault = e.target.checked; savePrefs(); };
  $('#nf').onsubmit = async e => { e.preventDefault(); try { await S.fb.updateName($('#nm').value.trim()); toast('Name saved'); } catch (er) { toast(er.message); } };
  $('#pw')?.addEventListener('click', async () => { try { await S.fb.resetPassword(S.user.email); toast('Reset link sent to ' + S.user.email); } catch (e) { toast(e.message); } });

  // reports you shared
  const all = await S.fb.listShared(100);
  const mine = all.filter(x => x.ownerUid === S.user.uid);
  $('#shared').innerHTML = mine.length ? `<p class="f" style="margin-top:16px">Reports you shared</p><ul class="rowlist">${mine.map(x => `<li><span>${esc(x.role)}${x.target ? ' → ' + esc(x.target) : ''} <span class="mono t3">${date(x.createdAt)}</span></span>
    <button class="btn sm" data-unshare="${esc(x.id.split('_').slice(1).join('_'))}">Stop sharing</button></li>`).join('')}</ul>` : '';
  $$('[data-unshare]').forEach(b => b.onclick = async () => { await S.fb.unshareReport(b.dataset.unshare).catch(e => toast(e.message)); b.closest('li').remove(); toast('No longer shared'); });

  $('#exp').onclick = async () => {
    $('#exp').disabled = true;
    try {
      const d = await S.fb.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(d, (k, v) => (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v ? new Date(v.seconds * 1000).toISOString() : v), 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `willai-data-${new Date().toISOString().slice(0, 10)}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message); }
    $('#exp').disabled = false;
  };
  $('#del').onclick = () => { $('#delf').hidden = false; $('#dc').focus(); };
  $('#dcancel').onclick = () => { $('#delf').hidden = true; };
  $('#dc').oninput = () => { $('#dgo').disabled = $('#dc').value.trim().toLowerCase() !== 'delete my account'; };
  $('#delf').onsubmit = async e => {
    e.preventDefault(); $('#dgo').disabled = true; $('#derr').innerHTML = '';
    try {
      await S.fb.deleteAccount($('#dp')?.value);
      localStorage.removeItem('willai.career'); sessionStorage.clear();
      toast('Your account and data are deleted'); location.hash = '#/';
    } catch (er) { $('#derr').innerHTML = `<p class="err">${esc(er.message)}</p>`; $('#dgo').disabled = false; }
  };
}
