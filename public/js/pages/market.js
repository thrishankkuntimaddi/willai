// The job market today: the job map, headline numbers, and what employers ask for, all computed from live postings.
import { S, $, app, esc, num, pct, hm, ranked, MODE_LABEL } from '../core.js';

export default async function market() {
  const t = S.trends || await window.WILLAI.loadTrends?.();
  if (!t) { app().innerHTML = '<div class="loading"><h2>Waking the job board</h2><p class="t2">Market figures appear as soon as today’s openings are in.</p></div>'; document.addEventListener('willai:trends', () => market(), { once: true }); return; }
  const tech = t.families.filter(f => f.tech), techTotal = tech.reduce((a, f) => a + f.v, 0);
  const ok = t.sources.filter(s => s.ok), groups = {};
  for (const s of t.sources) (groups[s.name.split(':')[0]] ||= []).push(s);
  app().innerHTML = `<div class="enter">
    <header class="page-h"><div><h1>The tech job market today</h1><p>Computed from every active opening we collected: ${num(t.total)} from ${num(t.companies)} companies, ${num(techTotal)} of them in tech</p></div><span class="asof">updated ${hm(t.collectedAt)}</span></header>
    <section class="map-card" id="map" aria-label="Job map: roles, skills and companies, linked by how often they appear together"></section>
    <div class="stats" style="margin-top:24px">
      <div class="stat"><p class="k">Active openings</p><p class="v">${num(t.total)}</p></div>
      <div class="stat"><p class="k">New this week</p><p class="v">${num(t.newThisWeek)}</p></div>
      <div class="stat"><p class="k">Ask for AI skills or tools</p><p class="v">${pct(t.aiMentionRate)}</p></div>
      <div class="stat"><p class="k">Remote · hybrid</p><p class="v">${pct(t.remoteShare)} · ${pct(t.hybridShare)}</p></div></div>
    <div class="cols">
      <section class="card"><h2>Tech roles by family</h2><p class="sub">Click one to see its openings</p>
        <ul class="ranked">${tech.slice(0, 16).map((f, i, a) => `<li><a href="#/jobs?family=${f.k}" title="${esc(f.label)}">${esc(f.label)}</a><div class="track"><i style="width:${(f.v / a[0].v) * 100}%"></i></div><b>${num(f.v)}</b></li>`).join('')}</ul></section>
      <div class="stack">
        <section class="card"><h2>Skills employers ask for</h2><p class="sub">Across tech openings</p>${ranked(t.topSkills, 12)}</section>
        <section class="card"><h2>New roles built around AI</h2><p class="sub">Titles that exist because of AI</p>${ranked(t.emergingRoles, 8, x => x.k.replace(/\b\w/g, c => c.toUpperCase()))}</section>
      </div></div>
    <div class="cols">
      <section class="card"><h2>Hiring the most</h2><p class="sub">Companies by open roles</p>${ranked(t.topCompanies, 12)}</section>
      <div class="stack">
        <section class="card"><h2>Where</h2><p class="sub">Countries by openings</p>${ranked(t.countries, 8)}</section>
        <section class="card"><h2>How people work</h2><p class="sub">Share of openings</p>${ranked(t.modes.filter(m => m.k !== 'unknown').map(m => ({ ...m, k: MODE_LABEL[m.k] })), 3)}</section>
      </div></div>
    <section class="card" style="margin-top:24px"><h2>Sources</h2><p class="sub">${ok.length} of ${t.sources.length} sources answered in the last collection. Company boards are each company’s own careers page.</p>
      ${Object.entries(groups).map(([k, list]) => `<details class="src"><summary><b>${esc(k)}</b><span class="mono t3">${list.length > 1 ? `${list.filter(s => s.ok).length} boards · ` : ''}${num(list.reduce((a, s) => a + (s.count || 0), 0))} openings</span></summary>
        <ul class="rowlist">${list.map(s => `<li><span>${esc(s.name.split(':')[1] || s.name)}</span><span class="mono ${s.ok ? 't3' : ''}" style="${s.ok ? '' : 'color:var(--auto)'}">${s.ok ? num(s.count) : 'offline'}</span></li>`).join('')}</ul></details>`).join('')}</section>
  </div>`;
  import('../people.js').then(m => m.mountJobMap?.($('#map'))).catch(e => console.warn('job map', e));
}
