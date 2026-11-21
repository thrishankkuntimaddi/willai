// Sign in or create an account (Google or email).
import { S, $, $$, app, esc, icon, toast, hashParams } from '../core.js';

export default function signin() {
  const fb = S.fb;
  const USER = S.user;
  if (!fb) { app().innerHTML = '<div class="auth"><h1>Sign-in is unavailable</h1><p class="t2">The sign-in service could not be loaded. Check your connection and reload.</p></div>'; return; }
  const hp = hashParams(), next = hp.get('next') || '#/me', wantEmployer = hp.get('role') === 'employer';
  if (USER) { location.hash = next; return; }
  let mode = wantEmployer ? 'up' : 'in', role = wantEmployer ? 'employer' : 'seeker';
  const draw = () => {
    app().innerHTML = `<div class="auth enter">
      <h1>${mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
      <p class="t2">${role === 'employer' ? 'Post roles for people changing careers' : 'Keep your reports, track your 90-day plan and save jobs'}</p>
      <div class="card">
        <button class="btn lg" id="g">${icon('google')}Continue with Google</button>
        <div class="or">or with email</div>
        <form id="af" style="display:flex;flex-direction:column;gap:16px">
          ${mode === 'up' ? `<div><label class="f" for="name">Your name</label><input class="in" id="name" maxlength="120" autocomplete="name"></div>
            <div><span class="f" style="display:block;font-size:13px;font-weight:500;margin-bottom:8px">Account type</span><div class="seg" id="roleSeg"><button type="button" data-role="seeker" class="${role === 'seeker' ? 'on' : ''}">Looking for work</button><button type="button" data-role="employer" class="${role === 'employer' ? 'on' : ''}">Hiring</button></div></div>
            ${role === 'employer' ? '<div><label class="f" for="company">Company</label><input class="in" id="company" required maxlength="120" autocomplete="organization"></div>' : ''}` : ''}
          <div><label class="f" for="email">Email</label><input class="in" id="email" type="email" required autocomplete="email"></div>
          <div><label class="f" for="pw">Password</label><input class="in" id="pw" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></div>
          <button class="btn pri lg">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <div id="aerr"></div>
        <p class="t2" style="font-size:14px">${mode === 'in' ? 'New here? <button class="link" id="sw">Create an account</button> · <button class="link" id="fp">Forgot password</button>' : 'Already have an account? <button class="link" id="sw">Sign in</button>'}</p>
      </div></div>`;
    const err = m => ($('#aerr').innerHTML = `<p class="err">${esc(m)}</p>`);
    const done = () => { location.hash = next; };
    $('#sw').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; draw(); };
    $$('#roleSeg [data-role]').forEach(b => b.onclick = () => { role = b.dataset.role; draw(); });
    if ($('#fp')) $('#fp').onclick = async () => { const em = $('#email').value.trim(); if (!em) return err('Enter your email first.'); try { await fb.resetPassword(em); toast('Reset link sent'); } catch (e) { err(e.message); } };
    $('#g').onclick = async () => { try { await fb.signInGoogle(role); done(); } catch (e) { err(e.message); } };
    $('#af').onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector('button.pri'); b.disabled = true;
      try {
        if (mode === 'in') await fb.signInEmail($('#email').value.trim(), $('#pw').value);
        else await fb.signUpEmail({ name: $('#name').value.trim(), email: $('#email').value.trim(), password: $('#pw').value, role, company: $('#company')?.value.trim() || '' });
        done();
      } catch (er) { err(er.message); b.disabled = false; }
    };
  };
  draw();
}
