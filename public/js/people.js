// The network views, drawn like ink on paper: dots for roles and skills, hairlines for "asked for together",
// and stamp-blue signals that travel along the links when something happens. No libraries; one small canvas engine.
import { S, $, api, esc, num } from './core.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const rgba = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
let GRAPH = null;
const graphData = () => (GRAPH ||= api('/api/graph').catch(e => { GRAPH = null; throw e; }));

// role → graph family, for people who shared a report (a small mirror of the server taxonomy)
const FAM_RX = [['ml_ai', /\b(ai|ml|machine learning|llm|data scien)/i], ['data_eng', /data engineer|etl|analytics engineer/i], ['data_sci', /analyst|analytics|\bbi\b/i],
  ['security', /security|cyber|soc\b/i], ['devops', /devops|sre|cloud|platform|infra/i], ['mobile', /android|ios|mobile|flutter/i], ['fullstack', /full[\s-]?stack/i],
  ['frontend', /front[\s-]?end|\bui\b|react|web dev/i], ['backend', /back[\s-]?end|java|python dev|node|golang|api/i], ['qa', /\bqa\b|test|sdet|quality/i],
  ['embedded', /embedded|firmware|hardware|vlsi/i], ['design', /design|ux/i], ['product', /product|program|project manager|scrum/i], ['it_support', /it support|help ?desk|admin/i],
  ['eng_mgmt', /engineering manager|head of eng/i], ['software', /software|developer|engineer|programmer/i]];
export const famOf = t => (FAM_RX.find(([, rx]) => rx.test(t || '')) || ['software'])[0];

/* ---------------- the engine ---------------- */
class Net {
  constructor(el, { height = 420, nodes, edges, label = n => n.kind === 'family', ambient = 900, onClick, tooltip, fixed = false, glyphs = [] }) {
    Object.assign(this, { el, height, label, ambient, onClick, tooltip, fixed });
    this.nodes = nodes.map(n => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, glow: 0 }));
    this.byId = new Map(this.nodes.map(n => [n.id, n]));
    this.edges = edges.map(e => ({ ...e, a: this.byId.get(e.a), b: this.byId.get(e.b) })).filter(e => e.a && e.b);
    this.adj = new Map(this.nodes.map(n => [n.id, []]));
    for (const e of this.edges) { this.adj.get(e.a.id).push(e); this.adj.get(e.b.id).push(e); }
    this.glyphs = glyphs; this.pulses = []; this.hover = null; this.visible = true; this.alpha = 1;
    this.c = { ink: css('--t1') || '#1f1b16', mute: css('--t3') || '#7b7266', accent: css('--accent') || '#2747c9', aug: css('--aug') || '#b7791f', line: '#1f1b16' };
    this.canvas = document.createElement('canvas'); this.canvas.className = 'net';
    this.canvas.setAttribute('role', 'img');
    this.tip = document.createElement('div'); this.tip.className = 'net-tip'; this.tip.hidden = true;
    el.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d');
    this.resize(); this.place();
    if (!fixed) for (let i = 0; i < 320; i++) this.step(1 - i / 340);
    this.bind();
    this.ro = new ResizeObserver(() => { const w = this.w; this.resize(); if (Math.abs(w - this.w) > 2) { this.place(); if (!fixed) for (let i = 0; i < 200; i++) this.step(1 - i / 220); } this.draw(); }); this.ro.observe(el);
    this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; if (this.visible) this.loop(); }); this.io.observe(el);
    this.draw();
    if (!REDUCED) this.loop();
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = this.el.clientWidth || 600; this.h = this.height;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  r(n) { return n.r ?? (n.kind === 'family' ? Math.min(13, 4 + Math.sqrt(n.v) / 5) : n.kind === 'company' ? 3.4 : n.kind === 'you' ? 9 : Math.min(5, 1.8 + Math.sqrt(n.v) / 12)); }
  place() {
    const fams = this.nodes.filter(n => n.kind === 'family'), cx = this.w / 2, cy = this.h / 2;
    if (this.fixed) { for (const n of this.nodes) { n.x = n.fx * this.w; n.y = n.fy * this.h; } return; }
    fams.forEach((n, i) => { const a = (i / fams.length) * Math.PI * 2 + 0.3, ring = i % 2 ? 0.62 : 1; n.hx = n.x = cx + Math.cos(a) * (this.w / 2 - 70) * ring; n.hy = n.y = cy + Math.sin(a) * (this.h / 2 - 40) * ring; });
    for (const n of this.nodes) if (n.kind !== 'family') {
      const home = this.adj.get(n.id).map(e => (e.a === n ? e.b : e.a)).find(m => m.kind === 'family') || fams[0] || { x: cx, y: cy };
      n.x = home.x + (Math.random() - 0.5) * 80; n.y = home.y + (Math.random() - 0.5) * 60;
    }
  }
  step(alpha) {
    const N = this.nodes, pad = 24;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 0.01;
      if (d2 > 90000) continue;
      const f = (a.kind === 'family' && b.kind === 'family' ? 2600 : 520) / d2 * alpha, d = Math.sqrt(d2);
      dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const e of this.edges) {
      const L = e.a.kind === 'family' || e.b.kind === 'family' ? (e.a.kind === 'company' || e.b.kind === 'company' ? 78 : 62) : 54;
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1, k = 0.018 * alpha * (d - L) / d;
      e.a.vx += dx * k; e.a.vy += dy * k; e.b.vx -= dx * k; e.b.vy -= dy * k;
    }
    const cx = this.w / 2, cy = this.h / 2;
    for (const n of N) {
      if (n.hx != null) { n.vx += (n.hx - n.x) * 0.16; n.vy += (n.hy - n.y) * 0.16; }   // role families hold their place on the ring
      else { n.vx += (cx - n.x) * 0.0006 * alpha; n.vy += (cy - n.y) * 0.001 * alpha; }
      n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy;
      n.x = Math.max(pad, Math.min(this.w - pad, n.x)); n.y = Math.max(pad, Math.min(this.h - pad, n.y));
    }
  }
  neighbors(n) { return new Set(this.adj.get(n.id).map(e => (e.a === n ? e.b : e.a).id).concat(n.id)); }
  // a signal leaves a node along its links, and some of it travels on
  emit(id, depth = 2, color) {
    const n = this.byId.get(id); if (!n || REDUCED) { if (n) { n.glow = 1; this.draw(); } return; }
    n.glow = 1;
    const out = this.adj.get(id).slice().sort(() => Math.random() - 0.5).slice(0, depth > 1 ? 5 : 3);
    for (const e of out) this.pulses.push({ from: n, to: e.a === n ? e.b : e.a, t: 0, speed: 0.012 + Math.random() * 0.012, depth: depth - 1, color: color || this.c.accent });
    this.loop();
  }
  pulseAlong(aId, bId, color) { const a = this.byId.get(aId), b = this.byId.get(bId); if (a && b && !REDUCED) { this.pulses.push({ from: a, to: b, t: 0, speed: 0.01, depth: 0, color: color || this.c.accent }); this.loop(); } }
  loop() {
    if (this.raf || REDUCED || !this.visible) return;
    const frame = now => {
      this.raf = 0;
      if (!this.el.isConnected) return this.destroy();
      if (this.ambient && (!this.lastAmbient || now - this.lastAmbient > this.ambient)) {
        this.lastAmbient = now;
        const e = this.edges[Math.floor(Math.random() * this.edges.length)];
        if (e && this.pulses.length < 30) this.pulses.push({ from: e.a, to: e.b, t: 0, speed: 0.008, depth: 0, color: this.c.accent, faint: true });
      }
      for (const p of this.pulses) {
        p.t += p.speed;
        if (p.t >= 1 && !p.done) { p.done = true; p.to.glow = Math.max(p.to.glow, p.faint ? 0.4 : 1); if (p.depth > 0 && Math.random() < 0.8) this.emit(p.to.id, p.depth, p.color); }
      }
      this.pulses = this.pulses.filter(p => p.t < 1.05);
      let busy = this.pulses.length > 0;
      for (const n of this.nodes) if (n.glow > 0) { n.glow = Math.max(0, n.glow - 0.02); busy = true; }
      this.draw();
      if (busy || this.ambient) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  draw() {
    const { ctx, c } = this, hv = this.hover, nb = hv ? this.neighbors(hv) : null, hl = this.highlight;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const e of this.edges) {
      const on = (nb && nb.has(e.a.id) && nb.has(e.b.id) && (e.a === hv || e.b === hv)) || (hl && (hl.has(e.a.id) && hl.has(e.b.id)));
      ctx.strokeStyle = on ? rgba(c.accent, 0.55) : rgba(c.line, e.faint ? 0.05 : 0.09);
      ctx.lineWidth = on ? 1.2 : 0.8;
      if (e.dashed) ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const p of this.pulses) {
      const t = Math.min(1, p.t), x = p.from.x + (p.to.x - p.from.x) * t, y = p.from.y + (p.to.y - p.from.y) * t;
      const t0 = Math.max(0, t - 0.18), x0 = p.from.x + (p.to.x - p.from.x) * t0, y0 = p.from.y + (p.to.y - p.from.y) * t0;
      const g = ctx.createLinearGradient(x0, y0, x, y); g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(1, rgba(p.color, p.faint ? 0.35 : 0.85));
      ctx.strokeStyle = g; ctx.lineWidth = p.faint ? 1 : 1.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      const rg = ctx.createRadialGradient(x, y, 0, x, y, p.faint ? 4 : 7); rg.addColorStop(0, rgba(p.color, p.faint ? 0.5 : 0.9)); rg.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, p.faint ? 4 : 7, 0, 7); ctx.fill();
    }
    for (const n of this.nodes) {
      const r = this.r(n), dim = (nb && !nb.has(n.id)) || (hl && !hl.has(n.id));
      if (n.glow > 0) {
        const rg = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 14 * n.glow); rg.addColorStop(0, rgba(n.glowColor || c.accent, 0.28 * n.glow)); rg.addColorStop(1, rgba(n.glowColor || c.accent, 0));
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(n.x, n.y, r + 14 * n.glow, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = dim ? 0.25 : 1;
      if (n.kind === 'person') this.person(n.x, n.y, n.scale || 1, n.moving ? c.aug : c.ink, n.glow);
      else if (n.kind === 'company' || n.hollow) { ctx.strokeStyle = n.hollow ? c.aug : c.mute; ctx.lineWidth = 1.2; ctx.fillStyle = css('--card') || '#fdfbf7'; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = n.kind === 'family' || n.kind === 'you' ? c.ink : n.strong ? c.ink : rgba(c.ink, n.faint ? 0.25 : 0.5); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill(); }
      if (n.glow > 0.3 && n.kind !== 'person') { ctx.strokeStyle = rgba(c.accent, n.glow); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.5, 0, 7); ctx.stroke(); }
      const showLabel = this.label(n) || n === hv || (nb && nb.has(n.id) && n.kind !== 'person') || (hl && hl.has(n.id) && n.kind !== 'person');
      if (showLabel && n.label) {
        const big = n.kind === 'family' || n.kind === 'you';
        ctx.font = big ? `400 ${n.kind === 'you' ? 15 : 13}px Newsreader, Georgia, serif` : '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = big ? c.ink : c.mute; ctx.textAlign = n.align || 'center'; ctx.textBaseline = 'top';
        const tx = n.align === 'left' ? n.x + r + 6 : n.align === 'right' ? n.x - r - 6 : n.x, ty = n.align ? n.y - 6 : n.y + r + 4;
        ctx.lineWidth = 3; ctx.strokeStyle = rgba(css('--card') || '#fdfbf7', 0.9); ctx.strokeText(n.label, tx, ty); ctx.fillText(n.label, tx, ty);
      }
      ctx.globalAlpha = 1;
    }
  }
  // a head-and-shoulders silhouette
  person(x, y, s, color, glow) {
    const ctx = this.ctx; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - 5 * s, 3 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5.2 * s, y + 5 * s); ctx.quadraticCurveTo(x - 5.2 * s, y - 1.2 * s, x, y - 1.2 * s); ctx.quadraticCurveTo(x + 5.2 * s, y - 1.2 * s, x + 5.2 * s, y + 5 * s); ctx.closePath(); ctx.fill();
  }
  bind() {
    const pick = ev => {
      const b = this.canvas.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
      let best = null, bd = 16;
      for (const n of this.nodes) { const d = Math.hypot(n.x - x, n.y - y) - this.r(n); if (d < bd) { bd = d; best = n; } }
      return { n: best, x, y };
    };
    this.canvas.addEventListener('pointermove', ev => {
      const { n, x, y } = pick(ev);
      if (n !== this.hover) { this.hover = n; this.canvas.style.cursor = n && this.onClick ? 'pointer' : 'default'; this.draw(); }
      const tip = n && this.tooltip?.(n);
      this.tip.hidden = !tip;
      if (tip) { this.tip.innerHTML = tip; this.tip.style.left = Math.min(this.w - 220, x + 12) + 'px'; this.tip.style.top = (y + 14) + 'px'; }
    });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.hidden = true; this.draw(); });
    this.canvas.addEventListener('click', ev => { const { n } = pick(ev); if (n) { this.emit(n.id, 2); this.onClick?.(n); } });
  }
  destroy() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.io?.disconnect(); }
}

const srList = (title, items) => `<div class="sr-only"><p>${esc(title)}</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`;

/* ---------------- Market: today's tech job map ---------------- */
export async function mountJobMap(el) {
  if (!el) return;
  el.innerHTML = `<div class="map-h"><div><h2>Today’s tech job map</h2><p class="sub">Role families, the skills they ask for and who is hiring, linked when they appear in the same postings. Hover to trace a role, click to open its jobs.</p></div>
    <form class="map-search" id="msf"><input class="in" id="msq" placeholder="Light up a skill or role" aria-label="Find on the map" list="msl"><datalist id="msl"></datalist></form></div><div class="map-canvas"></div>
    <div class="map-key"><span><i class="k-fam"></i>Role family</span><span><i class="k-skill"></i>Skill</span><span><i class="k-co"></i>Company</span><span><i class="k-line"></i>Asked for together</span><span><i class="k-pulse"></i>Signal</span></div>`;
  let g;
  try { g = await graphData(); } catch { el.querySelector('.map-canvas').innerHTML = '<p class="empty">The map is unavailable right now</p>'; return; }
  const net = new Net(el.querySelector('.map-canvas'), {
    height: innerWidth < 720 ? 380 : 480, nodes: g.nodes, edges: g.edges, ambient: 1100,
    label: n => n.kind === 'family',
    tooltip: n => `<b>${esc(n.label)}</b><span>${n.kind === 'family' ? `${num(n.v)} openings` : n.kind === 'skill' ? `asked for in ${num(n.v)} tech openings` : `${num(n.v)} tech openings`}</span>`,
    onClick: n => setTimeout(() => { location.hash = n.kind === 'family' ? `#/jobs?family=${encodeURIComponent(n.key)}` : `#/jobs?q=${encodeURIComponent(n.key)}`; }, REDUCED ? 0 : 650),
  });
  net.canvas.setAttribute('aria-label', 'Network of tech role families, skills and companies');
  el.insertAdjacentHTML('beforeend', srList('Role families by openings', g.nodes.filter(n => n.kind === 'family').map(n => `${n.label}: ${n.v}`)));
  $('#msl', el).innerHTML = g.nodes.map(n => `<option value="${esc(n.label)}">`).join('');
  $('#msf', el).onsubmit = e => {
    e.preventDefault();
    const q = $('#msq', el).value.trim().toLowerCase(), n = g.nodes.find(x => x.label.toLowerCase() === q) || g.nodes.find(x => x.label.toLowerCase().includes(q));
    if (!n) return;
    net.highlight = net.neighbors(net.byId.get(n.id)); net.emit(n.id, 3); net.draw();
    setTimeout(() => { net.highlight = null; net.draw(); }, 4000);
  };
  setTimeout(() => { const f = g.nodes.find(n => n.kind === 'family'); if (f) net.emit(f.id, 3); }, 600);
}

/* ---------------- Home: people moving through tech ---------------- */
export async function mountPeople(el) {
  if (!el) return;
  const [g, shared] = await Promise.all([graphData().catch(() => null), S.fb ? S.fb.listShared(60) : []]);
  if (!g || !el.isConnected) { el.remove?.(); return; }
  const fams = g.nodes.filter(n => n.kind === 'family').slice(0, 9);
  const famSet = new Set(fams.map(f => f.id));
  const skills = g.nodes.filter(n => n.kind === 'skill').slice(0, 36).map(n => ({ ...n, faint: true }));
  const edges = g.edges.filter(e => (famSet.has(e.a) || e.a.startsWith('s:')) && skills.some(s => s.id === e.b || s.id === e.a) && !e.a.startsWith('c:') && !e.b.startsWith('c:')).map(e => ({ ...e, faint: true }));
  const people = shared.slice(0, 40).map((s, i) => {
    const from = 'f:' + famOf(s.role), to = 'f:' + famOf(s.target || s.role);
    return { id: 'p:' + i, kind: 'person', label: '', v: 1, moving: !!(s.target && famOf(s.target) !== famOf(s.role)) || (s.target && s.target !== s.role), from: famSet.has(from) ? from : fams[0].id, to: famSet.has(to) ? to : null, s };
  });
  const pe = people.map(p => ({ a: p.id, b: p.from, v: 1, faint: true }));
  el.innerHTML = `<div class="band-in"><div class="band-h"><h2>People moving through tech right now</h2>
    <p class="sub">${people.length ? `${people.length} people shared their path anonymously. <span class="amber">Amber</span> ones are moving to a new kind of role; signals show where they are heading.` : 'Each dot is a skill employers ask for, linked to the roles that ask for it. Share your report after you rate it and you will appear here, anonymously.'}</p></div>
    <div class="band-canvas"></div></div>`;
  const net = new Net($('.band-canvas', el), {
    height: innerWidth < 720 ? 240 : 280, nodes: [...fams, ...skills, ...people], edges: [...edges, ...pe], ambient: people.length ? 0 : 1600,
    label: n => n.kind === 'family',
    tooltip: n => n.kind === 'person' ? `<b>${esc(n.s.role)}${n.s.target && n.s.target !== n.s.role ? ' → ' + esc(n.s.target) : ''}</b><span>${[n.s.yearsBand, n.s.city || n.s.country].filter(Boolean).map(esc).join(' · ')}${Number.isFinite(+n.s.readiness) && n.s.readiness != null ? ` · readiness ${Math.round(+n.s.readiness)}` : ''}</span>`
      : n.kind === 'family' ? `<b>${esc(n.label)}</b><span>${num(n.v)} openings</span>` : `<b>${esc(n.label)}</b>`,
    onClick: n => { if (n.kind === 'family') location.hash = `#/jobs?family=${encodeURIComponent(n.key)}`; },
  });
  net.canvas.setAttribute('aria-label', people.length ? `${people.length} people and the tech roles they are in or moving to` : 'Skills linked to the tech roles that ask for them');
  const movers = people.filter(p => p.to && p.to !== p.from);
  if (movers.length && !REDUCED) {
    const tick = () => { if (!el.isConnected) return; const p = movers[Math.floor(Math.random() * movers.length)]; net.byId.get(p.id).glow = 1; net.pulseAlong(p.id, p.to, net.c.accent); setTimeout(tick, 2200 + Math.random() * 1200); };
    setTimeout(tick, 800);
  }
}

/* ---------------- Report: your map (have → target ← missing, → who is hiring) ---------------- */
export function mountYourMap(section, { p, r }) {
  const rows = r.scores?.readiness?.rows || [];
  if (!section || !rows.length || !$('.readiness', section)) return;
  const wrap = document.createElement('div'); wrap.className = 'yourmap';
  $('.readiness', section).after(wrap);
  const have = rows.filter(x => x.status !== 'missing').slice(0, 8), miss = rows.filter(x => x.status === 'missing').slice(0, 8);
  const cos = (r.market?.companies || []).slice(0, 4);
  const target = r.scores.readiness.target;
  const col = (list, fx) => list.map((x, i) => ({ fy: (i + 1) / (list.length + 1), fx }));
  const nodes = [
    { id: 't', kind: 'you', label: target, v: 1, fx: 0.5, fy: 0.5, r: 9 },
    ...have.map((x, i) => ({ id: 'h' + i, kind: 'skill', label: x.skill, v: x.weight * 10, strong: x.status === 'has', align: 'right', ...col(have, 0.2)[i], r: 3 + x.weight / 4 })),
    ...miss.map((x, i) => ({ id: 'm' + i, kind: 'skill', hollow: true, label: x.skill, v: x.weight * 10, align: 'left', ...col(miss, 0.8)[i], r: 3 + x.weight / 4 })),
    ...cos.map((c, i) => ({ id: 'c' + i, kind: 'company', label: c.k, v: c.v, fx: 0.35 + (i * 0.3) / Math.max(1, cos.length - 1), fy: 0.88 })),
  ];
  const edges = [...have.map((_, i) => ({ a: 'h' + i, b: 't', v: 1 })), ...miss.map((_, i) => ({ a: 'm' + i, b: 't', v: 1, dashed: true })), ...cos.map((_, i) => ({ a: 't', b: 'c' + i, v: 1, faint: true }))];
  wrap.innerHTML = `<p class="mono t3">your map · filled: skills you have · hollow: skills to learn · lines: what ${esc(target)} openings ask for</p>`;
  const net = new Net(wrap, { height: Math.max(240, Math.max(have.length, miss.length) * 30 + 80), nodes, edges, fixed: true, ambient: 0,
    label: n => n.kind !== 'company' || true, tooltip: n => n.kind === 'skill' ? `<b>${esc(n.label)}</b><span>${n.hollow ? 'to learn' : 'you have it'}</span>` : '' });
  net.canvas.setAttribute('aria-label', `Your skills linked to ${target}`);
  if (!REDUCED) { let i = 0; const go = () => { if (!wrap.isConnected) return; if (have.length) net.pulseAlong('h' + (i++ % have.length), 't'); setTimeout(go, 900); }; setTimeout(go, 400); }
}

/* ---------------- shared by the analysis loading screen ---------------- */
export async function loadingNet(el, c) {
  const g = await graphData().catch(() => null);
  const mine = [...(c.skills || []).map(s => s.name), ...(c.technologies || [])].slice(0, 9);
  const fams = (g?.nodes || []).filter(n => n.kind === 'family').slice(0, 6);
  const cos = (g?.nodes || []).filter(n => n.kind === 'company').sort((a, b) => b.v - a.v).slice(0, 6);
  const col = (n, i) => (i + 1) / (n + 1);
  const nodes = [
    ...mine.map((s, i) => ({ id: 'k' + i, kind: 'skill', strong: true, label: s, v: 20, fx: 0.16, fy: col(mine.length, i), align: 'right', r: 4 })),
    ...fams.map((f, i) => ({ ...f, fx: 0.5, fy: col(fams.length, i), r: 7 })),
    ...cos.map((f, i) => ({ ...f, label: f.label.length > 16 ? f.label.slice(0, 15) + '…' : f.label, fx: 0.82, fy: col(cos.length, i), align: 'left', r: 4 })),
  ];
  const famIds = new Set(fams.map(f => f.id)), coIds = new Set(cos.map(x => x.id));
  const edges = [];
  mine.forEach((s, i) => { const linked = (g?.edges || []).filter(e => e.b === 's:' + s && famIds.has(e.a)).map(e => e.a); (linked.length ? linked : [fams[i % Math.max(1, fams.length)]?.id]).filter(Boolean).slice(0, 2).forEach(f => edges.push({ a: 'k' + i, b: f, v: 1 })); });
  (g?.edges || []).filter(e => famIds.has(e.a) && coIds.has(e.b)).forEach(e => edges.push({ a: e.a, b: e.b, v: 1 }));
  for (const f of fams) if (!edges.some(e => e.a === f.id && coIds.has(e.b)) && cos[0]) edges.push({ a: f.id, b: cos[Math.floor(Math.random() * cos.length)].id, v: 1 });
  const net = new Net(el, { height: 300, nodes, edges, fixed: true, ambient: 0, label: n => n.kind !== 'company' || true });
  net.canvas.setAttribute('aria-label', 'Your skills being matched to role families and companies');
  return {
    stage(i) {
      if (i === 0) mine.forEach((_, k) => setTimeout(() => net.emit('k' + k, 0), k * 120));
      else if (i <= 2) mine.forEach((_, k) => setTimeout(() => net.emit('k' + k, 2), k * 150));
      else fams.forEach((f, k) => setTimeout(() => net.emit(f.id, 1), k * 140));
      if (REDUCED) net.draw();
    },
    finish() { fams.forEach(f => net.emit(f.id, 1)); },
  };
}
