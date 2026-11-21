// Jobs portal: keyword + place search, filters with live counts, trust-aware results, and a "For you" tab.
import { S, $, $$, app, esc, num, icon, api, toast, hashParams, go, data, signedIn, hm, MODE_LABEL } from '../core.js';
import { jobRow, bindJobActions, forYou } from '../jobs-ui.js';
import { loadCareer } from '../career.js';
import { citySuggest } from '../forms.js';

const LISTS = ['family', 'seniority', 'mode', 'type', 'category'];
const FLAGS = ['salary', 'old', 'flagged', 'ai'];
let STATE = { key: '', items: [], page: 0, pages: 0, total: 0, facets: null };

function readParams() {
  const hp = hashParams();
  const f = { q: hp.get('q') || '', city: hp.get('city') || '', radius: hp.get('radius') || '50', country: hp.get('country') || '', days: hp.get('days') || '', tab: hp.get('tab') || '' };
  for (const k of LISTS) f[k] = (hp.get(k) || '').split(',').filter(Boolean);
  for (const k of FLAGS) f[k] = hp.get(k) === '1';
  if (!hp.has('flagged') && S.profile?.prefs?.hideFlagged === false) f.flagged = true;
  f.tech = hp.has('tech') ? hp.get('tech') === '1' : S.profile?.prefs?.techOnly !== false;
  return f;
}
const toParams = f => ({ q: f.q, city: f.city, radius: f.city && f.radius !== '50' ? f.radius : '', country: f.country, days: f.days, tab: f.tab,
  ...Object.fromEntries(LISTS.map(k => [k, f[k].join(',')])), ...Object.fromEntries(FLAGS.map(k => [k, f[k] ? '1' : ''])), tech: f.tech ? '' : '0' });

export default async function jobs() {
  const f = readParams();
  const set = over => go('#/jobs', toParams({ ...f, ...over }));
  const c = loadCareer();
  const canForYou = signedIn() || c.skills.length > 0;
  const tab = f.tab === 'foryou' && canForYou ? 'foryou' : 'all';
  app().innerHTML = `<div class="enter jobs-page">
    <header class="page-h"><div><h1>Open jobs</h1><p>Live openings from ${S.trends ? num(S.trends.companies) + ' company career pages and job boards' : 'company career pages and job boards'}, checked for scams, plus roles employers post here</p></div>
      ${S.trends ? `<span class="asof">updated ${hm(S.trends.collectedAt)}</span>` : ''}</header>
    <div class="tabs" role="tablist"><a role="tab" aria-selected="${tab === 'all'}" class="${tab === 'all' ? 'on' : ''}" href="#/jobs?${new URLSearchParams(Object.entries(toParams({ ...f, tab: '' })).filter(([, v]) => v))}">All openings</a>
      <a role="tab" aria-selected="${tab === 'foryou'}" class="${tab === 'foryou' ? 'on' : ''}" href="${canForYou ? '#/jobs?tab=foryou' : '#/profile'}">For you${canForYou ? '' : ' <span class="t3">(add your skills)</span>'}</a></div>
    ${tab === 'foryou' ? `<div id="fy"></div>` : `
    <form class="jobs-bar" id="jf" role="search">
      <label class="search">${icon('search')}<input class="in" name="q" value="${esc(f.q)}" placeholder="Job title, skill or company" maxlength="80" aria-label="Keyword"></label>
      <label class="search place">${icon('pin')}<input class="in" name="city" id="city" value="${esc(f.city)}" placeholder="City" maxlength="60" aria-label="City" autocomplete="off"><ul class="sugg" id="city-sugg" hidden></ul></label>
      <select class="in radius" name="radius" aria-label="Distance" ${f.city ? '' : 'disabled'}>${[25, 50, 100, 250].map(r => `<option value="${r}" ${+f.radius === r ? 'selected' : ''}>within ${r} km</option>`).join('')}</select>
      <button type="button" class="btn" id="near">${icon('pin')}Near me</button>
      <button class="btn pri">Search</button>
    </form>
    <div class="jobs-grid">
      <aside class="filters-side" id="side"><details open class="fold"><summary>Filters</summary><div id="facets"><p class="t3" style="font-size:13px">Loading</p></div></details></aside>
      <div><div class="result-h"><span id="count" class="mono t3"></span><span id="active" class="active-f"></span></div><div class="joblist" id="jl"><p class="empty">Loading openings</p></div></div>
    </div>`}
  </div>`;

  if (tab === 'foryou') {
    const el = $('#fy');
    const items = await forYou(el, { profile: c, limit: 30, title: 'Picked for you' });
    if (!c.skills.length) el.insertAdjacentHTML('afterbegin', `<p class="note">Add skills, cities and how you want to work to your <a href="#/profile">profile</a> for better matches.</p>`);
    return items;
  }

  // search bar
  $('#jf').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); set({ q: fd.get('q').trim(), city: fd.get('city').trim(), radius: fd.get('radius') || '50' }); };
  const cityIn = $('#city'), sugg = $('#city-sugg');
  cityIn.oninput = async () => {
    const list = cityIn.value.trim().length >= 2 ? (await citySuggest(cityIn.value.trim())).slice(0, 6) : [];
    sugg.hidden = !list.length;
    sugg.innerHTML = list.map(s => `<li data-v="${esc(s.value)}">${esc(s.value)}<span class="mono t3">${esc(s.meta)}</span></li>`).join('');
    $$('li', sugg).forEach(li => li.onmousedown = e => { e.preventDefault(); cityIn.value = li.dataset.v; sugg.hidden = true; $('[name=radius]').disabled = false; });
  };
  cityIn.onblur = () => setTimeout(() => (sugg.hidden = true), 120);
  $('#near').onclick = () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    $('#near').disabled = true;
    navigator.geolocation.getCurrentPosition(async pos => {
      const { cities } = await data('cities');
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const d = ([, , lat, lon]) => Math.hypot(lat - here.lat, (lon - here.lon) * Math.cos(here.lat * Math.PI / 180));
      const best = [...cities].sort((a, b) => d(a) - d(b))[0];
      set({ city: best[0], radius: '50' });                   // only the nearest city name is used; your position is not sent anywhere
    }, () => { $('#near').disabled = false; toast('Could not get your location. Type a city instead.'); }, { timeout: 8000, maximumAge: 6e5 });
  };

  const qs = page => new URLSearchParams(Object.entries({ ...toParams(f), tab: '', tech: f.tech ? '1' : '', page, facets: page === 1 ? '1' : '' }).filter(([, v]) => v));
  const key = JSON.stringify(toParams(f));
  const draw = () => {
    $('#count').textContent = `${num(STATE.total)} openings${f.q ? ` for "${f.q}"` : ''}${f.city ? ` near ${f.city}` : ''}`;
    $('#jl').innerHTML = STATE.items.length ? STATE.items.map(jobRow).join('') + `<div class="more-row"><span class="mono">${num(STATE.items.length)} of ${num(STATE.total)}</span>${STATE.page < STATE.pages ? '<button class="btn sm" id="more">Load more</button>' : ''}</div>`
      : `<div class="empty"><p>No openings match${f.q ? ` "${esc(f.q)}"` : ''}${f.city ? ` near ${esc(f.city)}` : ''}.</p><p style="margin-top:8px">Try a broader title, a bigger distance, or ${f.tech ? '<a href="#" id="alltypes">all kinds of roles</a>' : 'fewer filters'}.</p></div>`;
    bindJobActions(STATE.items, $('#jl'));
    $('#alltypes')?.addEventListener('click', e => { e.preventDefault(); set({ tech: false }); });
    const more = $('#more');
    if (more) more.onclick = async () => {
      more.disabled = true;
      try { const d = await api('/api/jobs?' + qs(STATE.page + 1)); STATE.items.push(...d.items); STATE.page = d.page; STATE.pages = d.pages; draw(); }
      catch (e) { toast(e.message); more.disabled = false; }
    };
    drawFacets(f, set);
  };
  try {
    if (STATE.key !== key) {
      const d = await api('/api/jobs?' + qs(1));
      STATE = { key, items: d.items, page: 1, pages: d.pages, total: d.total, facets: d.facets };
    }
    draw();
  } catch (e) { $('#jl').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

const MODE_ORDER = ['remote', 'hybrid', 'onsite'];
const LEVEL_ORDER = ['intern', 'entry', 'junior', 'mid', 'senior', 'lead'];
const LEVEL_TEXT = { intern: 'Internship', entry: 'Fresher / entry', junior: 'Junior', mid: 'Mid level', senior: 'Senior', lead: 'Lead and above' };
const TYPE_TEXT = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' };
function drawFacets(f, set) {
  const fc = STATE.facets;
  if (!fc) return;
  const count = (list, k) => list.find(x => x.k === k)?.v || 0;
  const box = (name, k, label, n) => `<label class="check fc"><input type="checkbox" data-l="${name}" value="${esc(k)}" ${f[name].includes(k) ? 'checked' : ''}><span>${esc(label)}</span><b class="mono">${num(n)}</b></label>`;
  const fams = fc.family.filter(x => !f.tech || x.tech).slice(0, 14);
  $('#facets').innerHTML = `
    <fieldset><legend>How you work</legend>${MODE_ORDER.map(k => box('mode', k, MODE_LABEL[k], count(fc.mode, k))).join('')}</fieldset>
    <fieldset><legend>Level</legend>${LEVEL_ORDER.map(k => box('seniority', k, LEVEL_TEXT[k], count(fc.seniority, k))).join('')}</fieldset>
    <fieldset><legend>Posted</legend>${[['', 'Any time'], ['1', 'Last 24 hours'], ['3', 'Last 3 days'], ['7', 'Last week'], ['30', 'Last month']].map(([v, l]) => `<label class="check fc"><input type="radio" name="days" value="${v}" ${f.days === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <fieldset><legend>Role</legend><label class="check fc"><input type="checkbox" id="tech" ${f.tech ? 'checked' : ''}><span>Tech roles only</span></label>
      ${fams.map(x => box('family', x.k, x.label, x.v)).join('')}</fieldset>
    ${fc.city.length ? `<fieldset><legend>Top cities</legend>${fc.city.slice(0, 8).map(x => `<button type="button" class="fc-link" data-city="${esc(x.k)}"><span>${esc(x.k)}</span><b class="mono">${num(x.v)}</b></button>`).join('')}</fieldset>` : ''}
    <fieldset><legend>Type</legend>${['full_time', 'contract', 'internship', 'part_time'].map(k => box('type', k, TYPE_TEXT[k], count(fc.type, k))).join('')}</fieldset>
    ${fc.category.length ? `<fieldset><legend>Company type</legend>${fc.category.slice(0, 11).map(x => box('category', x.k, x.k, x.v)).join('')}</fieldset>` : ''}
    <fieldset><legend>More</legend>
      <label class="check fc"><input type="checkbox" data-flag="salary" ${f.salary ? 'checked' : ''}><span>Pay is listed</span></label>
      <label class="check fc"><input type="checkbox" data-flag="ai" ${f.ai ? 'checked' : ''}><span>Asks for AI skills</span></label>
      <label class="check fc"><input type="checkbox" data-flag="old" ${f.old ? 'checked' : ''}><span>Include older and closed</span></label>
      <label class="check fc"><input type="checkbox" data-flag="flagged" ${f.flagged ? 'checked' : ''}><span>Show postings with scam warnings</span></label></fieldset>`;
  $$('[data-l]').forEach(c => c.onchange = () => { const k = c.dataset.l, v = new Set(f[k]); c.checked ? v.add(c.value) : v.delete(c.value); set({ [k]: [...v] }); });
  $$('[name=days]').forEach(c => c.onchange = () => set({ days: c.value }));
  $$('[data-flag]').forEach(c => c.onchange = () => set({ [c.dataset.flag]: c.checked }));
  $$('[data-city]').forEach(b => b.onclick = () => set({ city: b.dataset.city }));
  $('#tech').onchange = e => set({ tech: e.target.checked, family: [] });
  const chips = [...(f.q ? [['q', f.q]] : []), ...(f.city ? [['city', `${f.city} · ${f.radius} km`]] : []),
    ...LISTS.flatMap(k => f[k].map(v => [k, { ...MODE_LABEL, ...LEVEL_TEXT, ...TYPE_TEXT }[v] || fc.family.find(x => x.k === v)?.label || v, v])),
    ...(f.days ? [['days', `last ${f.days} d`]] : [])];
  $('#active').innerHTML = chips.map(([k, l, v]) => `<button type="button" class="chip-x" data-k="${k}" data-v="${esc(v || '')}">${esc(l)}${icon('x')}</button>`).join('') + (chips.length ? '<a href="#/jobs" class="link" style="font-size:13px">Clear all</a>' : '');
  $$('#active [data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; set(LISTS.includes(k) ? { [k]: f[k].filter(x => x !== b.dataset.v) } : { [k]: '' }); });
}
