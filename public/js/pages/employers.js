// Employers post roles through the WillAI server, which runs the same scam checks as every collected posting.
import { S, $, $$, app, esc, icon, toast, ago, api, signedIn } from '../core.js';
import { trustBadge } from '../jobs-ui.js';

export default async function employers() {
  if (!S.fb) { app().innerHTML = '<div class="prose"><h1>For employers</h1><p>Posting jobs needs sign-in, which is unavailable right now.</p></div>'; return; }
  if (!S.fb.isReady()) { app().innerHTML = '<div class="loading"><h2>Loading</h2></div>'; return; }
  if (!signedIn()) {
    app().innerHTML = `<div class="enter"><header class="page-h"><div><h1>Hire people growing into tech</h1>
      <p>Freshers with real projects, testers moving into automation, analysts moving into data engineering, people returning from a career break. Post a role and it appears next to live openings for everyone searching here, free.</p></div></header>
      <ul class="bullets narrow"><li><b>Checked like every other posting.</b> Roles that ask applicants for money, use only WhatsApp, or hide behind link shorteners are flagged.</li>
        <li><b>Verified employer badge.</b> Sign in with a confirmed work email on your company’s domain.</li>
        <li><b>Matched to the right people.</b> Your role shows up in “For you” for people whose skills and level fit.</li></ul>
      <div class="ask-foot" style="margin-top:24px"><a class="btn pri lg" href="#/signin?role=employer&next=${encodeURIComponent('#/employers')}">Sign in to post a job</a><a class="link" href="#/jobs">See open jobs</a></div></div>`;
    return;
  }
  if (S.profile?.role !== 'employer') {
    app().innerHTML = `<div class="auth enter"><h1>Switch to an employer account</h1><p class="t2">Your account is set up for finding work. Add your company to post roles. Everything else keeps working.</p>
      <form class="card" id="ef"><div><label class="f" for="company">Company name</label><input class="in" id="company" required maxlength="120" value="${esc(S.profile?.company || '')}"></div>
      <button class="btn pri">Become an employer</button><div id="eerr"></div></form></div>`;
    $('#ef').onsubmit = async e => { e.preventDefault(); try { await S.fb.becomeEmployer($('#company').value.trim()); employers(); } catch (er) { $('#eerr').innerHTML = `<p class="err">${esc(er.message)}</p>`; } };
    return;
  }
  const domain = (S.user.email || '').split('@')[1] || '';
  app().innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>Your job postings</h1><p>Roles you post appear on the Jobs page for everyone, marked as posted on WillAI</p></div></header>
    <div class="cols" style="margin-top:0">
      <form class="card" id="pj">
        <h2>Post a job</h2><p class="sub">Clear titles, pay ranges and real apply links get more applicants and pass our checks</p>
        <div class="grid2">
          <div class="full"><label class="f" for="title">Job title</label><input class="in" id="title" required maxlength="120" placeholder="Junior frontend developer"></div>
          <div><label class="f" for="company">Company</label><input class="in" id="company" required maxlength="120" value="${esc(S.profile.company || '')}"></div>
          <div><label class="f" for="location">City</label><input class="in" id="location" maxlength="120" placeholder="Hyderabad, India"></div>
          <div><label class="f" for="type">Type</label><select class="in" id="type">${['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'].map(t => `<option>${t}</option>`).join('')}</select></div>
          <div><label class="f" for="work_mode">How people work</label><select class="in" id="work_mode"><option value="onsite">In the office</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></div>
          <div class="full"><label class="f" for="salary">Pay <span>optional, but roles with pay get more applicants</span></label><input class="in" id="salary" maxlength="80" placeholder="₹6–8 LPA"></div>
          <div class="full"><label class="f" for="description">Description</label><textarea class="in" id="description" required minlength="80" maxlength="6000" rows="7" placeholder="What the person will do, the skills you need, and who would fit even without the exact title"></textarea></div>
          <div class="full"><label class="f" for="applyUrl">Where to apply</label><input class="in" id="applyUrl" required maxlength="500" placeholder="https://yourcompany.com/careers/123 or mailto:hr@yourcompany.com"></div>
        </div>
        <p class="note" style="margin-top:16px">${S.user.emailVerified && domain && !/gmail|yahoo|hotmail|outlook|rediffmail|icloud|proton/.test(domain) ? `Signed in as <b>${esc(S.user.email)}</b>. Roles whose company or apply link matches <b>${esc(domain)}</b> get the verified employer badge.` : 'Sign in with a confirmed work email on your company’s domain to get the verified employer badge.'} Never ask applicants for money or bank details.</p>
        <div class="ask-foot" style="margin-top:16px"><button class="btn pri">Post job</button></div><div id="perr"></div>
      </form>
      <section class="card"><h2>Posted by you</h2><p class="sub">${esc(S.profile.company || '')}</p><ul class="rowlist" id="mine"><li class="t3">Loading</li></ul></section>
    </div></div>`;
  const draw = async () => {
    const { items } = await api('/api/employer/jobs').catch(() => ({ items: [] }));
    $('#mine').innerHTML = items.length ? items.map(j => `<li><div style="min-width:0"><b style="font-weight:500">${esc(j.title)}</b><br>
        <span class="mono t3">${j.status === 'active' ? 'open' : esc(j.status)} · ${ago(j.posted)}${j.reports ? ` · ${j.reports} report${j.reports > 1 ? 's' : ''}` : ''}</span> ${trustBadge(j.trust, { full: true })}</div>
      <span class="r"><button class="btn sm" data-st="${esc(j.id)}" data-to="${j.status === 'active' ? 'closed' : 'active'}">${j.status === 'active' ? 'Close' : 'Reopen'}</button><button class="icon-btn" data-del="${esc(j.id)}" title="Delete" aria-label="Delete">${icon('trash')}</button></span></li>`).join('') : '<li class="t3">Nothing posted yet</li>';
    $$('[data-st]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/api/employer/jobs?id=${encodeURIComponent(b.dataset.st)}&status=${b.dataset.to}`, { method: 'PATCH' }); draw(); } catch (e) { toast(e.message); b.disabled = false; } });
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; toast('Click again to delete'); setTimeout(() => (b.dataset.armed = ''), 3000); return; }
      try { await api(`/api/employer/jobs?id=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); draw(); toast('Deleted'); } catch (e) { toast(e.message); }
    });
  };
  draw();
  $('#pj').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button.pri'); btn.disabled = true; $('#perr').innerHTML = '';
    const d = Object.fromEntries(['title', 'company', 'location', 'type', 'work_mode', 'salary', 'description', 'applyUrl'].map(k => [k, $('#' + k).value]));
    try {
      const r = await api('/api/employer/jobs', { json: d });
      e.target.reset(); $('#company').value = S.profile.company || '';
      toast(r.hidden ? 'Posted, but hidden: it failed our scam checks' : r.verified ? 'Posted with the verified employer badge' : 'Job posted');
      if (r.flags?.length) $('#perr').innerHTML = `<p class="err">Our checks flagged this posting. Edit the description to remove anything that looks like a fee, a WhatsApp-only contact or a personal email.</p>`;
      draw();
    } catch (er) { $('#perr').innerHTML = `<p class="err">${esc(er.message)}</p>`; }
    btn.disabled = false;
  };
}
