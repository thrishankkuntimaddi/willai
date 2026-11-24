// The career profile fields, as sections. The analyse steps show one section at a time; the profile page shows them all.
import { $, $$, esc, data } from './core.js';
import { STATUSES, MODES, PLAN_LENGTHS, GAP_REASONS, hasRole } from './career.js';
import { chips, rows, segmented, roleTypeahead, skillSuggest, citySuggest } from './forms.js';

const field = (id, label, input, hint = '') => `<div><label class="f" for="${id}">${label}${hint ? ` <span>${hint}</span>` : ''}</label>${input}</div>`;
const text = (C, k, ph, max = 80, extra = '') => `<input class="in" id="c-${k}" data-c="${k}" maxlength="${max}" placeholder="${esc(ph)}" value="${esc(C[k] ?? '')}" ${extra}>`;
const bindText = (root, C, persist) => $$('[data-c]', root).forEach(inp => inp.addEventListener('input', () => {
  const k = inp.dataset.c;
  C[k] = inp.dataset.num ? inp.value.replace(/[^\d.]/g, '').slice(0, 4) : inp.value;
  if (inp.dataset.num && inp.value !== C[k]) inp.value = C[k];
  persist();
}));

export const BODY = {
  now: C => `<div class="status-grid" role="radiogroup" aria-label="Your situation">${STATUSES.map(s => `<button type="button" role="radio" aria-checked="${C.status === s.id}" class="status${C.status === s.id ? ' on' : ''}" data-st="${s.id}"><b>${s.label}</b><span>${s.hint}</span></button>`).join('')}</div>
    <div id="st-fields" class="wz-fields"></div>`,
  skills: C => `${field('sk', 'Skills', '<div id="sk"></div>', 'tap a level to change it')}
    ${field('tech', 'Tools and technologies', '<div id="tech"></div>', 'optional')}
    <div><span class="f">Projects <span>optional, but they count</span></span><div id="proj" class="rowlist-ed"></div></div>`,
  edu: C => `<div id="edu" class="rowlist-ed"></div>`,
  goal: C => `${field('c-target', hasRole(C) ? 'A role you want next' : 'The role you want', text(C, 'target', 'Frontend developer, data analyst, cloud engineer'), hasRole(C) ? 'optional' : '')}
    <div><span class="f">How you want to work</span><div id="modes"></div></div>
    <div class="grid2">${field('loc', 'Cities', '<div id="loc"></div>', 'up to 5')}
      ${field('c-country', 'Country', `<select class="in" id="c-country" data-c="country"></select>`)}</div>
    <label class="check"><input type="checkbox" id="reloc" ${C.relocate ? 'checked' : ''}>I can move for the right job</label>`,
  plan: C => `<div><span class="f">Plan length</span><div class="plan-len"><div id="plen"></div>
      <label class="custom">or <input class="in sm" id="c-planDays" data-c="planDays" data-num="1" inputmode="numeric" value="${PLAN_LENGTHS.includes(+C.planDays) ? '' : esc(C.planDays)}" placeholder="days" aria-label="Custom number of days"></label></div></div>
    <div><label class="f" for="hrs">Time for learning <span id="hrs-v">${C.weeklyHours} hours a week</span></label><input type="range" id="hrs" min="2" max="40" step="1" value="${C.weeklyHours}"></div>
    <div><span class="f">Budget for courses</span><div id="budget"></div></div>
    ${field('c-constraints', 'Anything else we should plan around', `<textarea class="in" id="c-constraints" data-c="constraints" rows="2" maxlength="300" placeholder="Night shifts, slow laptop, prefer Telugu videos">${esc(C.constraints)}</textarea>`, 'optional')}`,
};

// Labels for the "where you are now" fields, per situation. Short labels so they never wrap and push inputs out of line.
const FIELDS = {
  working: { role: 'Your current role', rolePh: 'Frontend developer, QA engineer, IT support', num: 'Years', numKey: 'years', numPh: '3',
    company: 'Company', companyPh: 'Where you work', daily: 'What you do on a normal day', dailyPh: 'Build React screens from Figma, fix bugs, write unit tests, review PRs' },
  between: { role: 'Your last role', rolePh: 'Frontend developer, QA engineer, IT support', num: 'Years', numKey: 'years', numPh: '3',
    company: 'Last company', companyPh: 'Where you worked', daily: 'What you did on a normal day', dailyPh: 'Built React screens, fixed bugs, wrote unit tests, reviewed PRs' },
  freelancer: { role: 'What you do for clients', rolePh: 'Web developer, designer, data analyst', num: 'Years', numKey: 'years', numPh: '3',
    company: 'Kind of clients', companyPh: 'Startups, agencies, local shops', daily: 'What a normal project looks like', dailyPh: 'Build Shopify stores, set up analytics, fix site speed' },
  gap: { role: 'Your last role', rolePh: 'Software engineer', num: 'Years worked', numKey: 'years', numPh: '2',
    daily: 'What you did in that role', dailyHint: 'the plan will get these skills current', dailyPh: 'Built APIs in Java, wrote tests, handled releases' },
  fresher: { role: 'Internship or part-time role', roleOpt: true, rolePh: 'Optional', num: 'Graduated', numKey: 'gradYear', numPh: '2026',
    company: 'Where you interned', companyPh: 'Company or lab', daily: 'What you have built or worked on', dailyHint: 'optional', dailyPh: 'Final-year project in React, internship fixing bugs, hackathons' },
  student: { role: 'Internship or part-time role', roleOpt: true, rolePh: 'Optional', num: 'Graduating', numKey: 'gradYear', numPh: '2027',
    company: 'Where you interned', companyPh: 'Company or lab', daily: 'What you have built or worked on', dailyHint: 'optional', dailyPh: 'Course projects, a portfolio site, open-source fixes' },
};

export const BIND = {
  now: (root, C, persist) => {
    const draw = () => {
      const st = C.status, f = $('#st-fields', root);
      // Every situation gets the same shape (a role with a short number beside it, one full-width line, then a few sentences),
      // so the card keeps its size and nothing jumps when someone switches between options.
      const v = FIELDS[st] || FIELDS.working;
      f.innerHTML = `
        <div class="ask-row">${field('c-role', v.role, text(C, 'role', v.rolePh), v.roleOpt ? 'optional' : '')}${field(v.numKey === 'gradYear' ? 'c-gradYear' : 'c-years', v.num, text(C, v.numKey, v.numPh, 4, 'data-num="1" inputmode="numeric"'))}</div>
        ${st === 'gap' ? `<div class="grid2">${field('c-gapMonths', 'Length of the break', text(C, 'gapMonths', 'Months, e.g. 18', 4, 'data-num="1" inputmode="numeric"'))}
          ${field('c-gapReason', 'Reason', `<select class="in" id="c-gapReason" data-c="gapReason"><option value="">Prefer not to say</option>${GAP_REASONS.map(r => `<option ${C.gapReason === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`, 'optional')}</div>`
        : field('c-company', v.company, text(C, 'company', v.companyPh), 'optional')}
        ${field('c-dailyWork', v.daily, `<textarea class="in" id="c-dailyWork" data-c="dailyWork" rows="3" maxlength="800" placeholder="${esc(v.dailyPh)}">${esc(C.dailyWork)}</textarea>`, v.dailyHint)}`;
      bindText(f, C, persist);
      $$('select[data-c]', f).forEach(s => s.onchange = () => { C[s.dataset.c] = s.value; persist(); });
    };
    $$('[data-st]', root).forEach(b => b.onclick = () => {
      C.status = b.dataset.st; persist();
      $$('[data-st]', root).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      draw();
    });
    draw();
  },
  skills: (root, C, persist) => {
    chips($('#sk', root), { values: C.skills, levels: true, suggest: skillSuggest, placeholder: 'React, SQL, Python, Excel…', label: 'Skills', onChange: persist });
    chips($('#tech', root), { values: C.technologies, suggest: skillSuggest, placeholder: 'Git, Figma, Jira, VS Code…', label: 'Tools', max: 30, onChange: persist });
    rows($('#proj', root), { values: C.projects, onChange: persist, addLabel: 'Add a project', max: 6, blankRow: () => ({ name: '', stack: '', summary: '' }),
      fields: [{ k: 'name', label: 'Project', placeholder: 'Expense tracker' }, { k: 'stack', label: 'Built with', placeholder: 'React, Firebase' },
        { k: 'summary', label: 'What you did and the result', placeholder: 'Built charts and auth; 30 classmates use it', type: 'textarea', wide: true }] });
  },
  edu: (root, C, persist) => {
    if (!C.education.length) C.education.push({ degree: '', field: '', year: '' });
    rows($('#edu', root), { values: C.education, onChange: persist, addLabel: 'Add another', max: 3, blankRow: () => ({ degree: '', field: '', year: '' }),
      fields: [{ k: 'degree', label: 'Degree or course', placeholder: 'B.Tech, BCA, Diploma, 12th' }, { k: 'field', label: 'Subject', placeholder: 'Computer science' },
        { k: 'year', label: 'Year', placeholder: '2024', type: 'number', max: 4 }] });
  },
  goal: async (root, C, persist) => {
    bindText(root, C, persist);
    roleTypeahead($('#c-target', root), { onPick: v => { C.target = v; persist(); } });
    segmented($('#modes', root), { options: MODES, value: C.workModes, multi: true, label: 'Work modes', onChange: persist });
    chips($('#loc', root), { values: C.locations, suggest: citySuggest, placeholder: 'Hyderabad, Bengaluru…', max: 5, label: 'Cities', onChange: persist });
    $('#reloc', root).onchange = e => { C.relocate = e.target.checked; persist(); };
    const { countries } = await data('cities');
    const sel = $('#c-country', root);
    sel.innerHTML = `<option value="">Anywhere</option>${Object.keys(countries).map(c => `<option ${c === C.country ? 'selected' : ''}>${c}</option>`).join('')}`;
    sel.onchange = () => { C.country = sel.value; persist(); };
  },
  plan: (root, C, persist) => {
    const custom = $('#c-planDays', root);
    segmented($('#plen', root), { options: PLAN_LENGTHS.map(d => ({ id: d, label: d < 180 ? `${d} days` : '6 months' })), value: +C.planDays, label: 'Plan length',
      onChange: v => { C.planDays = v; custom.value = ''; persist(); } });
    custom.oninput = () => { const v = custom.value.replace(/\D/g, '').slice(0, 3); custom.value = v; if (v) { C.planDays = Math.max(7, Math.min(365, +v)); persist(); $$('#plen button', root).forEach(b => b.classList.remove('on')); } };
    $('#hrs', root).oninput = e => { C.weeklyHours = +e.target.value; $('#hrs-v', root).textContent = `${C.weeklyHours} hours a week`; persist(); };
    segmented($('#budget', root), { options: [{ id: 'free', label: 'Free only' }, { id: 'some', label: 'Can pay for some' }], value: C.budget, label: 'Budget', onChange: v => { C.budget = v; persist(); } });
    bindText(root, C, persist);
  },
};


export const SECTIONS = Object.fromEntries(Object.keys(BODY).map(k => [k, { html: BODY[k], bind: BIND[k] }]));
