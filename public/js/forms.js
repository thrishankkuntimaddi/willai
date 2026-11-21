// Small form widgets: chip inputs with suggestions and levels, segmented choices, repeatable rows, role typeahead.
import { esc, icon, data, api, num } from './core.js';
import { LEVELS } from './career.js';

let uid = 0;
const key = v => (typeof v === 'string' ? v : v.name).toLowerCase();

/* Chip input. values: strings, or { name, level } when levels is true. suggest(q) → [{ value, meta }] */
export function chips(el, { values, onChange, suggest, levels = false, placeholder = '', max = 40, label = '' }) {
  const id = `chips${++uid}`;
  let open = [], active = -1;
  const draw = () => {
    el.innerHTML = `<div class="chips" data-id="${id}">
      ${values.map((v, i) => `<span class="chip${levels ? ' lv' + v.level : ''}">
        <span>${esc(typeof v === 'string' ? v : v.name)}</span>
        ${levels ? `<button type="button" class="lvl" data-lvl="${i}" title="Change level" aria-label="${esc(v.name)} level: ${LEVELS[v.level]}. Change">${LEVELS[v.level]}</button>` : ''}
        <button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(typeof v === 'string' ? v : v.name)}">${icon('x')}</button></span>`).join('')}
      ${values.length < max ? `<input class="chip-in" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-label="${esc(label || placeholder)}" placeholder="${esc(values.length ? 'Add more' : placeholder)}" autocomplete="off">` : ''}
      <ul class="sugg" id="${id}-list" role="listbox" hidden></ul></div>`;
    bind();
  };
  const add = raw => {
    const name = String(raw).trim().replace(/,$/, '').slice(0, 60);
    if (!name || values.some(v => key(v) === name.toLowerCase())) return;
    values.push(levels ? { name, level: 2 } : name);
    onChange?.(values); draw(); el.querySelector('.chip-in')?.focus();
  };
  const showSugg = async q => {
    const list = el.querySelector('.sugg'), input = el.querySelector('.chip-in');
    open = q && suggest ? (await suggest(q)).filter(s => !values.some(v => key(v) === s.value.toLowerCase())).slice(0, 8) : [];
    active = -1;
    list.hidden = !open.length; input.setAttribute('aria-expanded', String(!!open.length));
    list.innerHTML = open.map((s, i) => `<li role="option" id="${id}-o${i}" data-i="${i}">${esc(s.value)}${s.meta ? `<span class="mono t3">${esc(s.meta)}</span>` : ''}</li>`).join('');
    list.querySelectorAll('li').forEach(li => li.onmousedown = e => { e.preventDefault(); add(open[+li.dataset.i].value); });
  };
  const bind = () => {
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { values.splice(+b.dataset.rm, 1); onChange?.(values); draw(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { const v = values[+b.dataset.lvl]; v.level = v.level % 3 + 1; onChange?.(values); draw(); el.querySelector(`[data-lvl="${b.dataset.lvl}"]`)?.focus(); });
    const input = el.querySelector('.chip-in');
    if (!input) return;
    input.oninput = () => showSugg(input.value.trim());
    input.onblur = () => setTimeout(() => { const l = el.querySelector('.sugg'); if (l) l.hidden = true; }, 120);
    input.onkeydown = e => {
      const items = el.querySelectorAll('.sugg li');
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; }
      else if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(active >= 0 ? open[active].value : input.value); return; }
      else if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); onChange?.(values); draw(); el.querySelector('.chip-in')?.focus(); return; }
      else return;
      items.forEach((li, i) => li.classList.toggle('on', i === active));
      input.setAttribute('aria-activedescendant', active >= 0 ? `${id}-o${active}` : '');
    };
  };
  draw();
}

export const skillSuggest = async q => {
  const { skills } = await data('skills'), s = q.toLowerCase();
  return Object.entries(skills).filter(([n, al]) => n.toLowerCase().includes(s) || al.some(a => a.startsWith(s)))
    .sort(([a], [b]) => (b.toLowerCase().startsWith(s) - a.toLowerCase().startsWith(s)) || a.length - b.length).map(([n]) => ({ value: n }));
};
export const citySuggest = async q => {
  const { cities } = await data('cities'), s = q.toLowerCase();
  return cities.filter(([n, , , , ...al]) => n.toLowerCase().startsWith(s) || al.some(a => a.startsWith(s))).map(([n, c]) => ({ value: n, meta: c }));
};

/* Segmented choice. multi → values is an array. */
export function segmented(el, { options, value, multi = false, onChange, label = '' }) {
  const draw = () => {
    el.innerHTML = `<div class="seg wide" role="${multi ? 'group' : 'radiogroup'}" aria-label="${esc(label)}">${options.map(o => {
      const on = multi ? value.includes(o.id) : value === o.id;
      return `<button type="button" role="${multi ? 'checkbox' : 'radio'}" aria-${multi ? 'checked' : 'checked'}="${on}" class="${on ? 'on' : ''}" data-v="${esc(o.id)}">${esc(o.label)}</button>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      const v = options.find(o => String(o.id) === b.dataset.v).id;
      if (multi) { const i = value.indexOf(v); i >= 0 ? value.splice(i, 1) : value.push(v); }
      else value = v;
      onChange?.(value); draw();
    });
  };
  draw();
}

/* Repeatable rows (projects, education). fields: [{ k, label, placeholder, type, wide }] */
export function rows(el, { values, fields, onChange, addLabel, max = 8, blankRow }) {
  const draw = () => {
    el.innerHTML = `${values.map((v, i) => `<div class="rowed" data-i="${i}">
        <div class="rowed-f">${fields.map(f => `<div class="${f.wide ? 'full' : ''}"><label class="f" for="r${uid}-${i}-${f.k}">${esc(f.label)}</label>${f.type === 'textarea'
          ? `<textarea class="in" rows="2" id="r${uid}-${i}-${f.k}" data-k="${f.k}" maxlength="${f.max || 400}" placeholder="${esc(f.placeholder || '')}">${esc(v[f.k] || '')}</textarea>`
          : `<input class="in" id="r${uid}-${i}-${f.k}" data-k="${f.k}" ${f.type === 'number' ? 'inputmode="numeric"' : ''} maxlength="${f.max || 120}" placeholder="${esc(f.placeholder || '')}" value="${esc(v[f.k] ?? '')}">`}</div>`).join('')}</div>
        <button type="button" class="icon-btn" data-del="${i}" aria-label="Remove">${icon('trash')}</button></div>`).join('')}
      ${values.length < max ? `<button type="button" class="btn sm" data-add>${icon('plus')}${esc(addLabel)}</button>` : ''}`;
    el.querySelectorAll('.rowed').forEach(r => r.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => {
      const f = fields.find(x => x.k === inp.dataset.k);
      values[+r.dataset.i][inp.dataset.k] = f.type === 'number' ? inp.value.replace(/\D/g, '').slice(0, 4) : inp.value; onChange?.(values);
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { values.splice(+b.dataset.del, 1); onChange?.(values); draw(); });
    el.querySelector('[data-add]')?.addEventListener('click', () => { values.push(blankRow()); onChange?.(values); draw(); el.querySelector('.rowed:last-of-type input')?.focus(); });
  };
  uid++; draw();
}

/* Role typeahead with live opening counts */
export function roleTypeahead(input, { onPick } = {}) {
  const list = document.createElement('ul'); list.className = 'sugg'; list.hidden = true; list.setAttribute('role', 'listbox');
  input.parentElement.style.position = 'relative'; input.after(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  let t, items = [], active = -1;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = input.value.trim();
      items = q.length < 2 ? [] : await api('/api/suggest?q=' + encodeURIComponent(q)).catch(() => []);
      active = -1; list.hidden = !items.length;
      list.innerHTML = items.map((s, i) => `<li role="option" data-i="${i}">${esc(s.k.replace(/\b\w/g, c => c.toUpperCase()))}<span class="mono t3">${num(s.v)} open</span></li>`).join('');
      list.querySelectorAll('li').forEach(li => li.onmousedown = e => { e.preventDefault(); pick(+li.dataset.i); });
    }, 160);
  });
  const pick = i => { input.value = items[i].k.replace(/\b\w/g, c => c.toUpperCase()); list.hidden = true; input.dispatchEvent(new Event('change')); onPick?.(input.value); };
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === active)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') list.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
}
