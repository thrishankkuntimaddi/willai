// The network views, drawn like ink on paper: dots for roles and skills, hairlines for "asked for together",
// and stamp-blue signals that travel along the links when something happens. No libraries; one small canvas engine.
import { S, $, $$, api, esc, num, toast, icon } from './core.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// a small seeded random, so the sphere is laid out the same way on every visit
const seeded = str => { let h = 1779033703 ^ str.length; for (const ch of str) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
const ZOOM = { min: 1.55, max: 4.2, home: 2.7 };   // camera distance from the globe's centre; the globe has radius 1
const NEAR = 1.75;  // a dot this much bigger than at the centre is close enough to show its name (only once you zoom in)
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
  constructor(el, { height = 420, nodes, edges, label = n => n.kind === 'family', ambient = 900, onClick, onFocus, tooltip, fixed = false, glyphs = [], sphere = false, fill = false }) {
    Object.assign(this, { el, height, label, ambient, onClick, onFocus, tooltip, fixed, sphere, fill });
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
    this.resize();
    if (sphere) { this.place3d(); this.cam = { yaw: 0.5, pitch: 0.25, dist: ZOOM.home, vyaw: 0, vpitch: 0 }; this.idleUntil = 0; }
    else { this.place(); if (!fixed) for (let i = 0; i < 320; i++) this.step(1 - i / 340); }
    this.bind();
    this.ro = new ResizeObserver(() => { const w = this.w, h = this.h; this.resize(); if (!sphere && (Math.abs(w - this.w) > 2 || Math.abs(h - this.h) > 2)) { this.place(); if (!fixed) for (let i = 0; i < 200; i++) this.step(1 - i / 220); } this.draw(); }); this.ro.observe(el);
    this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; if (this.visible) this.loop(); }); this.io.observe(el);
    this.draw();
    if (!REDUCED) this.loop();
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = this.el.clientWidth || 600;
    if (this.fill) this.height = Math.max(160, this.el.clientHeight || this.height);   // fill: take the box's size, whatever it is now
    this.h = this.height;
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
    if (this.raf || REDUCED || !this.visible || this.dead) return;
    const frame = now => {
      this.raf = 0;
      if (!this.el.isConnected || this.dead) return this.destroy();
      if (this.sphere) this.tick();
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
  // a signal: a short bright trail with a glowing head, easy to see against the hairlines
  spark(p, x0, y0, x, y, k) {
    const ctx = this.ctx, a = (p.faint ? 0.6 : 1) * k, w = p.faint ? 1.6 : 2.4, R = p.faint ? 6 : 10;
    const g = ctx.createLinearGradient(x0, y0, x, y); g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(1, rgba(p.color, 0.9 * a));
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.lineCap = 'butt';
    const rg = ctx.createRadialGradient(x, y, 0, x, y, R); rg.addColorStop(0, rgba(p.color, a)); rg.addColorStop(0.35, rgba(p.color, 0.45 * a)); rg.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.9 * a); ctx.beginPath(); ctx.arc(x, y, p.faint ? 1.2 : 1.8, 0, 7); ctx.fill();
  }
  draw() {
    if (this.sphere) return this.drawSphere();
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
      this.spark(p, x0, y0, x, y, 1);
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
  /* ---------------- 3D sphere ---------------- */
  // Everything sits on the globe's surface. Role families spread evenly; each skill and company starts at the average of the
  // roles that ask for it, then everything is relaxed apart a little so no two dots sit on top of each other.
  place3d() {
    const rand = seeded('willai-globe'), norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    const fams = this.nodes.filter(n => n.kind === 'family');
    fams.forEach((n, i) => { const y = 1 - ((i + 0.5) / fams.length) * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963; n.p = [Math.cos(a) * r, y, Math.sin(a) * r]; });
    const rest = this.nodes.filter(n => !n.p);
    for (const pass of [0, 1, 2]) for (const n of rest) {
      if (n.p) continue;
      const linked = this.adj.get(n.id).map(e => (e.a === n ? e.b : e.a)).filter(m => m.p && (pass > 0 || m.kind === 'family'));
      if (!linked.length) { if (pass === 2) n.p = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]); continue; }
      const sum = linked.reduce((t, m) => [t[0] + m.p[0], t[1] + m.p[1], t[2] + m.p[2]], [0, 0, 0]);
      n.p = norm(sum.map(x => x / linked.length + (rand() - 0.5) * (n.kind === 'company' ? 0.5 : 0.35)));
    }
    for (const n of rest) n.home = n.p.slice();
    // relax: dots push apart along the surface; each is held loosely near where it started
    for (let it = 0; it < 90; it++) {
      for (const n of rest) {
        let f = [0, 0, 0];
        for (const m of this.nodes) {
          if (m === n) continue;
          const d = [n.p[0] - m.p[0], n.p[1] - m.p[1], n.p[2] - m.p[2]], d2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
          if (d2 > 0.09) continue;
          const k = (m.kind === 'family' ? 0.0022 : 0.0012) / (d2 + 0.002);
          f = [f[0] + d[0] * k, f[1] + d[1] * k, f[2] + d[2] * k];
        }
        n.p = norm(n.p.map((x, i) => x + f[i] + (n.home[i] - x) * 0.02));
      }
    }
    // links follow the globe: the shortest path along the surface (a great circle), lifted a little in the middle
    for (const e of this.edges) {
      const A = e.a.p, B = e.b.p, ang = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -0.999, 1)), sin = Math.sin(ang) || 1e-6;
      const lift = 0.02 + 0.09 * ang / Math.PI, steps = Math.max(4, Math.ceil(ang / 0.12));
      e.path3 = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps, wa = Math.sin((1 - t) * ang) / sin, wb = Math.sin(t * ang) / sin, h = 1 + lift * Math.sin(Math.PI * t);
        return norm([A[0] * wa + B[0] * wb, A[1] * wa + B[1] * wb, A[2] * wa + B[2] * wb]).map(x => x * h);
      });
    }
    this.edgeOf = new Map();
    for (const e of this.edges) { this.edgeOf.set(e.a.id + '|' + e.b.id, e); this.edgeOf.set(e.b.id + '|' + e.a.id, e); }
    // latitude and longitude lines, so the globe reads as 3D while it turns
    this.grid = [];
    const ring = f => Array.from({ length: 65 }, (_, k) => f((k / 64) * TAU));
    for (let lon = 0; lon < 6; lon++) { const a = (lon / 6) * Math.PI; this.grid.push(ring(t => [Math.cos(a) * Math.sin(t), Math.cos(t), Math.sin(a) * Math.sin(t)])); }
    for (const lat of [-60, -30, 0, 30, 60]) { const y = Math.sin(lat * Math.PI / 180), r = Math.cos(lat * Math.PI / 180); this.grid.push(ring(t => [Math.cos(t) * r, y, Math.sin(t) * r])); }
  }
  // camera: turn by yaw and pitch, look at the centre from `dist`, perspective projection
  proj(p) {
    const c = this.cam, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const [x, y, z] = p, x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const s = ZOOM.home / Math.max(c.dist - z2, 0.05), R = Math.min(this.w, this.h) * 0.4;
    return { x: this.w / 2 + x1 * s * R, y: this.h / 2 - y2 * s * R, z: z2, s };
  }
  project() {
    const horizon = 1 / this.cam.dist;            // a point on the globe is in view when it faces the camera past this
    for (const n of this.nodes) {
      const q = this.proj(n.p);
      n.x = q.x; n.y = q.y; n.z = q.z; n.s = q.s;
      n.front = q.z > horizon - 0.01; n.vis = true;
      n.fade = n.front ? clamp(0.55 + (q.z - horizon) * 1.6, 0.55, 1) : 0.16;
    }
    for (const e of this.edges) { e.pts = e.path3.map(p => { const q = this.proj(p); q.front = q.z > horizon; return q; }); e.front = e.pts[e.pts.length >> 1].front; }
  }
  // auto-turn, the drift after a fling, and easing towards a focused node. Called every frame.
  tick() {
    const c = this.cam;
    if (c.target) {
      const t = c.target, dy = ((((t.yaw - c.yaw) % TAU) + TAU * 1.5) % TAU) - Math.PI;
      c.yaw += dy * 0.12; c.pitch += (t.pitch - c.pitch) * 0.12; c.dist += (t.dist - c.dist) * 0.12;
      if (Math.abs(dy) + Math.abs(t.pitch - c.pitch) + Math.abs(t.dist - c.dist) < 0.002) c.target = null;
    } else if (!this.drag) {
      if (Math.abs(c.vyaw) + Math.abs(c.vpitch) > 0.0003) { c.yaw += c.vyaw; c.pitch = clamp(c.pitch + c.vpitch, -1.35, 1.35); c.vyaw *= 0.95; c.vpitch *= 0.95; }
      else if (!REDUCED && performance.now() > this.idleUntil && !this.focused) c.yaw += 0.0018;
    }
    c.yaw = ((c.yaw % TAU) + TAU) % TAU;
  }
  // someone is using it: stop the slow auto-turn for a while
  hold(ms = 6000) { this.idleUntil = performance.now() + ms; if (REDUCED) { this.tickNow(); this.draw(); } else this.loop(); }
  tickNow() { const c = this.cam; if (c.target) { Object.assign(c, { yaw: c.target.yaw, pitch: c.target.pitch, dist: c.target.dist }); c.target = null; } }
  zoomBy(f) { const c = this.cam; c.target = { yaw: c.yaw, pitch: c.pitch, dist: clamp((c.target?.dist ?? c.dist) * f, ZOOM.min, ZOOM.max) }; this.hold(); }
  reset() { this.unfocus(); this.cam.vyaw = this.cam.vpitch = 0; this.cam.target = { yaw: 0.5, pitch: 0.25, dist: ZOOM.home }; this.hold(1500); }
  // turn the sphere so this node faces you, come a little closer, and light up what it is linked to
  focus(n) {
    const [x, y, z] = n.p, yaw = Math.atan2(-x, z), z1 = Math.hypot(x, z), pitch = clamp(Math.atan2(y, z1), -1.35, 1.35);
    const c = this.cam; c.vyaw = c.vpitch = 0;
    c.target = { yaw: ((yaw % TAU) + TAU) % TAU, pitch, dist: 2.1 };   // a fixed, comfortable distance, wherever you were
    this.focused = n; this.highlight = this.neighbors(n); this.emit(n.id, 3); this.hold(); this.onFocus?.(n);
  }
  unfocus() { if (!this.focused) return; this.focused = null; this.highlight = null; this.onFocus?.(null); this.draw(); }
  // a point along a link's path, measured from node `a` (0) to the other end (1)
  arcAt(e, a, t) {
    const P = e.pts, n = P.length - 1, f = (e.a === a ? t : 1 - t) * n, i = Math.min(n - 1, Math.floor(f)), r = f - i;
    return [P[i].x + (P[i + 1].x - P[i].x) * r, P[i].y + (P[i + 1].y - P[i].y) * r, P[i].front && P[i + 1].front];
  }
  drawSphere() {
    this.project();
    const { ctx, c } = this, hv = this.hover, nb = hv ? this.neighbors(hv) : null, hl = this.highlight, F = this.focused;
    const W = this.w, H = this.h, cx = W / 2, cy = H / 2, card = css('--card') || '#fdfbf7', raised = css('--raised') || '#efe9df';
    const rim = Math.min(W, H) * 0.4 * ZOOM.home / Math.sqrt(this.cam.dist ** 2 - 1);
    ctx.clearRect(0, 0, W, H);
    const lit = e => (nb && (e.a === hv || e.b === hv)) || (hl && hl.has(e.a.id) && hl.has(e.b.id) && (!F || e.a === F || e.b === F));
    // draw the near-side (front=true) or far-side (front=false) parts of a link
    const arc = (e, front, style, width) => {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); let on = false;
      for (let k = 1; k < e.pts.length; k++) {
        const a = e.pts[k - 1], b = e.pts[k];
        if ((a.front && b.front) === front || (!front && !(a.front && b.front))) { if (!on) ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); on = true; } else on = false;
      }
      ctx.stroke();
    };
    const dot = (n, r, alpha) => {
      ctx.globalAlpha = alpha;
      if (n.kind === 'company') {
        ctx.fillStyle = card; ctx.strokeStyle = c.mute; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill(); ctx.stroke();
      } else {
        const base = n.kind === 'family' ? c.ink : '#8a8175';
        const g = ctx.createRadialGradient(n.x - r * 0.35, n.y - r * 0.4, r * 0.1, n.x, n.y, r);
        g.addColorStop(0, n.kind === 'family' ? '#6b6258' : '#c9c1b5'); g.addColorStop(1, base);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const size = n => this.r(n) * clamp(n.s, 0.5, 2.6) * (n.kind === 'family' ? 1.05 : 1.15);

    // 1. the far side, seen faintly through the globe
    for (const e of this.edges) arc(e, false, rgba(c.line, 0.05), 0.7);
    for (const n of this.nodes) if (!n.front) dot(n, size(n) * 0.8, 0.22);

    // 2. the globe: a shaded body lit from the top left, a soft rim, and the latitude/longitude lines on the near side
    const body = ctx.createRadialGradient(cx - rim * 0.38, cy - rim * 0.42, rim * 0.05, cx, cy, rim);
    body.addColorStop(0, rgba(card, 0.95)); body.addColorStop(0.7, rgba(card, 0.9)); body.addColorStop(1, rgba(raised, 0.95));
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, rim, 0, 7); ctx.fill();
    const halo = ctx.createRadialGradient(cx, cy, rim * 0.96, cx, cy, rim * 1.12);
    halo.addColorStop(0, rgba(c.line, 0.05)); halo.addColorStop(1, rgba(c.line, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, rim * 1.12, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(c.line, 0.14); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, rim, 0, 7); ctx.stroke();
    const horizon = 1 / this.cam.dist;
    ctx.strokeStyle = rgba(c.line, 0.055); ctx.lineWidth = 0.8;
    for (const ring of this.grid) {
      ctx.beginPath(); let on = false;
      for (const p of ring) { const q = this.proj(p); if (q.z > horizon) { on ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); on = true; } else on = false; }
      ctx.stroke();
    }

    // 3. the near side: links as arcs over the surface, then signals travelling along them, then the dots
    for (const e of this.edges) if (!lit(e)) arc(e, true, rgba(c.line, e.faint ? 0.08 : 0.15), 0.8);
    for (const e of this.edges) if (lit(e)) { arc(e, false, rgba(c.accent, 0.18), 1.2); arc(e, true, rgba(c.accent, 0.8), 1.6); }
    for (const p of this.pulses) {
      const e = this.edgeOf.get(p.from.id + '|' + p.to.id); if (!e) continue;
      const t = Math.min(1, p.t), t0 = Math.max(0, t - 0.25);
      const pts = Array.from({ length: 9 }, (_, j) => this.arcAt(e, p.from, t0 + (t - t0) * (j / 8))), k = pts[8][2] ? 1 : 0.3;
      ctx.lineCap = 'round';
      for (let j = 1; j < pts.length; j++) {
        ctx.strokeStyle = rgba(p.color, (j / 8) * 0.9 * k * (p.faint ? 0.7 : 1)); ctx.lineWidth = (p.faint ? 1.4 : 2.2) * (0.4 + 0.6 * j / 8);
        ctx.beginPath(); ctx.moveTo(pts[j - 1][0], pts[j - 1][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      const [x, y] = pts[8], R = (p.faint ? 6 : 10) * (k < 1 ? 0.7 : 1), rg = ctx.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, rgba(p.color, k)); rg.addColorStop(0.35, rgba(p.color, 0.45 * k)); rg.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.9 * k); ctx.beginPath(); ctx.arc(x, y, p.faint ? 1.2 : 1.8, 0, 7); ctx.fill();
    }
    const front = this.nodes.filter(n => n.front).sort((a, b) => a.z - b.z);
    for (const n of front) {
      const dim = (nb && !nb.has(n.id)) || (hl && !hl.has(n.id)), r = size(n);
      if (n.glow > 0) {
        const rg = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 16 * n.glow); rg.addColorStop(0, rgba(c.accent, 0.35 * n.glow)); rg.addColorStop(1, rgba(c.accent, 0));
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(n.x, n.y, r + 16 * n.glow, 0, 7); ctx.fill();
      }
      dot(n, r, (dim ? 0.28 : 1) * n.fade);
      if (n === F || n.glow > 0.3) { ctx.strokeStyle = rgba(c.accent, n === F ? 1 : n.glow); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5, 0, 7); ctx.stroke(); }
    }

    // 4. names: what you point at or focus, what is linked to it, role families facing you, and anything you have zoomed close to.
    // Nearest first, skipping any that would overlap one already written.
    const named = front.filter(n => n.label && (n === hv || n === F || (nb && nb.has(n.id)) || (hl && hl.has(n.id))
      || (this.label(n) && n.fade > 0.7) || n.s > NEAR)).sort((a, b) => (b === hv || b === F) - (a === hv || a === F) || b.z - a.z);
    const boxes = [];
    for (const n of named) {
      const big = n.kind === 'family', fs = Math.round((big ? 13 : 11) * clamp(n.s, 0.95, 1.5));
      ctx.font = big ? `500 ${fs}px Newsreader, Georgia, serif` : `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const w = ctx.measureText(n.label).width, r = size(n), bx = { x: n.x - w / 2 - 3, y: n.y + r + 3, w: w + 6, h: fs + 4 };
      if (!(n === hv || n === F) && boxes.some(b => bx.x < b.x + b.w && b.x < bx.x + bx.w && bx.y < b.y + b.h && b.y < bx.y + bx.h)) continue;
      boxes.push(bx);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = rgba(card, 0.85);
      ctx.fillStyle = big ? c.ink : '#5e564c'; ctx.globalAlpha = n.fade;
      ctx.strokeText(n.label, n.x, bx.y + 1); ctx.fillText(n.label, n.x, bx.y + 1); ctx.globalAlpha = 1;
    }
  }
  bindSphere() {
    const cv = this.canvas, pts = new Map(), c = this.cam;
    cv.style.touchAction = 'pan-y';            // one finger up/down still scrolls the page; sideways turns the sphere, two fingers zoom
    cv.style.cursor = 'grab'; cv.tabIndex = 0;
    cv.addEventListener('pointerdown', ev => {
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { cv.setPointerCapture(ev.pointerId); } catch {}
      if (pts.size === 1) { this.drag = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false }; c.vyaw = c.vpitch = 0; c.target = null; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: c.dist }; if (this.drag) this.drag.moved = true; }
      this.hold();
    });
    cv.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        c.dist = clamp(this.pinch.dist * this.pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1), ZOOM.min, ZOOM.max);
      } else if (this.drag) {
        const dx = ev.clientX - this.drag.lx, dy = ev.clientY - this.drag.ly, k = 0.0065 * Math.min(1, c.dist / 2);
        this.drag.lx = ev.clientX; this.drag.ly = ev.clientY;
        if (Math.hypot(ev.clientX - this.drag.x, ev.clientY - this.drag.y) > 5) { this.drag.moved = true; cv.style.cursor = 'grabbing'; this.tip.hidden = true; }
        if (!this.drag.moved) return;
        c.yaw += dx * k; c.pitch = clamp(c.pitch + dy * k, -1.35, 1.35); c.vyaw = dx * k; c.vpitch = dy * k;
      }
      this.hold();
    });
    const up = ev => {
      pts.delete(ev.pointerId);
      if (pts.size < 2) this.pinch = null;
      if (pts.size === 0) { if (this.drag?.moved) this.suppressClick = true; this.drag = null; cv.style.cursor = this.hover ? 'pointer' : 'grab'; }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // the wheel zooms. Zooming in always stays on the map; zooming out past the furthest view hands the wheel back to the page,
    // so scrolling down over the map still gets you down the page.
    cv.addEventListener('wheel', ev => {
      const nd = clamp(c.dist * Math.exp(ev.deltaY * 0.0012), ZOOM.min, ZOOM.max);
      if (ev.deltaY > 0 && Math.abs(nd - c.dist) < 1e-4) return;
      ev.preventDefault(); c.target = null; c.dist = nd; this.hold();
    }, { passive: false });
    cv.addEventListener('keydown', ev => {
      const turn = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] }[ev.key];
      if (turn) { ev.preventDefault(); c.target = { yaw: c.yaw + turn[0], pitch: clamp(c.pitch + turn[1], -1.35, 1.35), dist: c.dist }; this.hold(); }
      else if (ev.key === '+' || ev.key === '=') this.zoomBy(0.8);
      else if (ev.key === '-' || ev.key === '_') this.zoomBy(1.25);
      else if (ev.key === '0' || ev.key === 'Escape') this.reset();
    });
  }
  bind() {
    if (this.sphere) this.bindSphere();
    const pick = ev => {
      const b = this.canvas.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
      let best = null, bd = 16;
      for (const n of this.nodes) {
        if (this.sphere && !n.front) continue;
        const d = Math.hypot(n.x - x, n.y - y) - this.r(n) * (this.sphere ? clamp(n.s, 0.4, 3) : 1) - (this.sphere ? n.z * 3 : 0);   // nearer dots win ties
        if (d < bd) { bd = d; best = n; }
      }
      return { n: best, x, y };
    };
    this.canvas.addEventListener('pointermove', ev => {
      if (this.drag?.moved || this.pinch) return;
      const { n, x, y } = pick(ev);
      if (n !== this.hover) { this.hover = n; this.canvas.style.cursor = n && (this.onClick || this.sphere) ? 'pointer' : this.sphere ? 'grab' : 'default'; this.draw(); }
      const tip = n && this.tooltip?.(n);
      this.tip.hidden = !tip;
      if (tip) { this.tip.innerHTML = tip; this.tip.style.left = Math.min(this.w - 220, x + 12) + 'px'; this.tip.style.top = (y + 14) + 'px'; }
    });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.hidden = true; this.draw(); });
    this.canvas.addEventListener('click', ev => {
      if (this.suppressClick) { this.suppressClick = false; return; }     // the end of a drag is not a click
      const { n } = pick(ev);
      if (this.sphere) return n ? this.focus(n) : this.unfocus();
      if (n) { this.emit(n.id, 2); this.onClick?.(n); }
    });
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.io?.disconnect(); }
}

const srList = (title, items) => `<div class="sr-only"><p>${esc(title)}</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`;

/* ---------------- Market: today's tech job map ---------------- */
const jobsLink = n => (n.kind === 'family' ? `#/jobs?family=${encodeURIComponent(n.key)}` : `#/jobs?q=${encodeURIComponent(n.key)}`);
const countText = n => (n.kind === 'family' ? `${num(n.v)} openings` : n.kind === 'skill' ? `asked for in ${num(n.v)} tech openings` : `${num(n.v)} tech openings`);
const HINT = 'Role families, the skills they ask for and who is hiring, linked when they appear in the same postings. Drag to turn the globe, zoom in until names appear, click a dot to see its jobs.';

export async function mountJobMap(el) {
  if (!el) return;
  el.innerHTML = `<div class="map-h"><div><h2>Today’s tech job map</h2><p class="sub">${HINT}</p></div>
    <div class="map-tools"><form class="map-search" id="msf" role="search">${icon('search')}<input class="in" id="msq" placeholder="Find a skill, role or company" aria-label="Find on the map" role="combobox" aria-expanded="false" aria-controls="msl" aria-autocomplete="list" autocomplete="off" spellcheck="false">
        <button type="button" class="ms-x" hidden aria-label="Clear search">${icon('x')}</button><ul class="sugg" id="msl" role="listbox" aria-label="Matches" hidden></ul></form></div></div>
    <div class="map-canvas"><div class="map-ctl" aria-label="Zoom">
        <button type="button" class="icon-btn" data-z="in" aria-label="Zoom in">+</button><button type="button" class="icon-btn" data-z="out" aria-label="Zoom out">−</button><button type="button" class="btn sm" data-z="reset">Reset</button></div>
      <div class="map-focus" hidden></div></div>
    <div class="map-key"><span><i class="k-fam"></i>Role family</span><span><i class="k-skill"></i>Skill</span><span><i class="k-co"></i>Company</span><span><i class="k-line"></i>Asked for together</span><span><i class="k-pulse"></i>Signal</span></div>`;
  let g;
  try { g = await graphData(); } catch { el.querySelector('.map-canvas').innerHTML = '<p class="empty">The map is unavailable right now</p>'; return; }
  const box = $('.map-canvas', el), ctl = $('.map-ctl', el), card = $('.map-focus', el);
  // the card for a focused dot: what it is, how many openings, and the way into them
  const showFocus = n => {
    card.hidden = !n;
    if (!n) return;
    card.innerHTML = `<b>${esc(n.label)}</b><span>${esc(countText(n))}</span><a href="${jobsLink(n)}">Open jobs →</a><button type="button" class="link" data-unfocus>Clear</button>`;
    $('[data-unfocus]', card).onclick = () => net.unfocus();
  };
  const net = new Net(box, {
    sphere: true, height: innerWidth < 720 ? 420 : 560, nodes: g.nodes, edges: g.edges, ambient: 450,
    label: n => n.kind === 'family',
    tooltip: n => `<b>${esc(n.label)}</b><span>${esc(countText(n))}</span>`,
    onFocus: showFocus,
  });
  box.prepend(net.canvas);
  net.canvas.setAttribute('aria-label', 'Globe of tech role families, skills and companies. Arrow keys turn it, plus and minus zoom, 0 resets.');
  setTimeout(() => { const f = g.nodes.find(n => n.kind === 'family'); if (f && !net.dead) net.emit(f.id, 3); }, 600);
  $$('[data-z]', ctl).forEach(b => b.onclick = () => (b.dataset.z === 'reset' ? net.reset() : net.zoomBy(b.dataset.z === 'in' ? 0.75 : 1.33)));
  el.insertAdjacentHTML('beforeend', srList('Role families by openings', g.nodes.filter(n => n.kind === 'family').map(n => `${n.label}: ${n.v}`)));
  bindMapSearch(el, g, () => net);
}

const KIND = { family: 'Role', skill: 'Skill', company: 'Company' };
// The map's search: matches as you type (names that start with it first, then the busiest), arrow keys and Enter,
// and picking one flies the sphere to it (or lights it up on the flat map). Empty, it offers the biggest role families.
function bindMapSearch(el, g, getNet) {
  const form = $('#msf', el), input = $('#msq', el), list = $('#msl', el), clear = $('.ms-x', el);
  let open = [], active = -1;
  const rank = q => {
    if (!q) return g.nodes.filter(n => n.kind === 'family').sort((a, b) => b.v - a.v).slice(0, 6);
    const score = n => { const l = n.label.toLowerCase(); return l.startsWith(q) ? 3 : l.split(/[\s/&,.-]+/).some(w => w.startsWith(q)) ? 2 : l.includes(q) ? 1 : 0; };
    return g.nodes.map(n => [n, score(n)]).filter(([, sc]) => sc).sort((a, b) => b[1] - a[1] || b[0].v - a[0].v).slice(0, 8).map(([n]) => n);
  };
  const show = () => {
    const q = input.value.trim().toLowerCase();
    open = rank(q); active = q && open.length ? 0 : -1;
    clear.hidden = !input.value;
    list.innerHTML = open.length ? open.map((n, i) => `<li role="option" id="msl-${i}" data-i="${i}" class="${i === active ? 'on' : ''}" aria-selected="${i === active}">
        <span>${esc(n.label)}</span><span class="mono t3">${KIND[n.kind] || ''} · ${num(n.v)}</span></li>`).join('')
      : `<li class="none" aria-disabled="true"><span class="t3">Nothing called “${esc(input.value.trim())}” on today’s map</span></li>`;
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', active >= 0 ? `msl-${active}` : '');
    $$('li[data-i]', list).forEach(li => li.onmousedown = e => { e.preventDefault(); pick(open[+li.dataset.i]); });
  };
  const hide = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const pick = n => {
    if (!n) return;
    input.value = n.label; clear.hidden = false; hide();
    const net = getNet(), node = net.byId.get(n.id);
    if (net.sphere) return net.focus(node);
    net.highlight = net.neighbors(node); net.emit(n.id, 3); net.draw();
    clearTimeout(net.hlT); net.hlT = setTimeout(() => { net.highlight = null; net.draw(); }, 4000);
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(hide, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (list.hidden) show(); if (!open.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + open.length) % open.length;
      $$('li[data-i]', list).forEach((li, i) => { li.classList.toggle('on', i === active); li.setAttribute('aria-selected', String(i === active)); });
      input.setAttribute('aria-activedescendant', `msl-${active}`);
      $(`#msl-${active}`, list)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') { if (!list.hidden) hide(); else { input.value = ''; clear.hidden = true; getNet().unfocus?.(); } }
  });
  form.onsubmit = e => { e.preventDefault(); const q = input.value.trim().toLowerCase(); if (!q) return; const n = open[active] || rank(q)[0]; n ? pick(n) : toast('Not on today’s map'); };
  clear.onclick = () => { input.value = ''; clear.hidden = true; getNet().unfocus?.(); input.focus(); };
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
  const net = new Net(el, { height: 300, fill: true, nodes, edges, fixed: true, ambient: 0, label: n => n.kind !== 'company' || true });
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
