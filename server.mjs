// WillAI backend: HTTP routes. Collection, storage, queries and the AI adviser live in lib/.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as store from './lib/db.mjs';
import { collect, isCollecting, liveSearch } from './lib/collect.mjs';
import * as Q from './lib/queries.mjs';
import { advise } from './lib/advise.mjs';
import { provider, Anthropic } from './lib/llm.mjs';
import { cleanField, filtersFrom } from './lib/params.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'willai-564c9';
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || `https://${FIREBASE_PROJECT_ID}.web.app,https://${FIREBASE_PROJECT_ID}.firebaseapp.com,http://localhost:8787,http://127.0.0.1:8787`).split(',').map(s => s.trim()));
const REFRESH_MS = 6 * 3600e3;

/* ---------------- request helpers ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain' };
const SEC = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.onrender.com",
    `frame-src https://${FIREBASE_PROJECT_ID}.firebaseapp.com https://accounts.google.com https://apis.google.com`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
};
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, ...SEC, ...(res.cors || {}) }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
async function readBody(req, limit = 16384) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
async function userFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], JWKS, { issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`, audience: FIREBASE_PROJECT_ID });
    return payload.sub ? { uid: payload.sub, email: payload.email, verified: !!payload.email_verified } : null;
  } catch { return null; }
}
const hits = new Map();
function allowed(key, max) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < 3600e3);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) hits.delete(hits.keys().next().value);
  return true;
}
const ipOf = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);

/* ---------------- routes ---------------- */
const routes = {
  'GET /api/health': async () => {
    const [size, run] = await Promise.all([store.sizeInfo(), store.lastRun()]);
    return { ok: true, postings: size.active, archived: size.stale + size.closed, bytes: size.bytes, db: store.db().kind,
      collectedAt: run?.started_at || null, collecting: isCollecting(), ai: provider() };
  },
  'GET /api/trends': () => Q.trends(),
  'GET /api/jobs': async (req, url) => {
    const f = filtersFrom(url.searchParams), page = Math.max(1, Math.min(100, +url.searchParams.get('page') || 1));
    if (f.q && page === 1) await withTimeout(liveSearch(f.q).catch(() => []), 6000);
    const [r, facets, t] = await Promise.all([Q.search(f, { page }), url.searchParams.get('facets') === '1' ? Q.cached('facets:' + JSON.stringify(f), 120e3, () => Q.facets(f)) : null, Q.trends()]);
    return { ...r, q: f.q, facets, collectedAt: t.collectedAt };
  },
  'GET /api/job': async (req, url) => {
    const j = await Q.job(cleanField(url.searchParams.get('id'), 300));
    if (!j) throw Object.assign(new Error('This job is no longer in our listings.'), { status: 404 });
    return { job: j, similar: await Q.similar(j) };
  },
  'GET /api/market': (req, url) => Q.market(cleanField(url.searchParams.get('q'), 80)),
  'GET /api/suggest': (req, url) => Q.suggest(cleanField(url.searchParams.get('q'), 60)),
  'POST /api/refresh': async req => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw Object.assign(new Error('local only'), { status: 403 });
    const run = await collect(); Q.clearCache(); return { ok: true, total: run.total };
  },
  'POST /api/advise': async req => {
    const user = await userFrom(req);
    const ok = user ? allowed('u:' + user.uid, Number(process.env.ADVISE_PER_HOUR_USER || 12)) : allowed('ip:' + ipOf(req), Number(process.env.ADVISE_PER_HOUR || 3));
    if (!ok) throw Object.assign(new Error(user ? 'You have reached the hourly limit. Try again in an hour.' : 'Free analyses for this hour are used up. Sign in for more.'), { status: 429 });
    const b = await readBody(req);
    const profile = {
      role: cleanField(b.role, 80), years: cleanField(b.years, 10), skills: cleanField(b.skills, 800), country: cleanField(b.country, 60),
      education: cleanField(b.education, 120), target: cleanField(b.target, 80), constraints: cleanField(b.constraints, 300),
    };
    if (profile.role.length < 2) throw Object.assign(new Error('Tell us your current job or role.'), { status: 400 });
    return advise(profile);
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const origin = req.headers.origin;
    res.cors = origin && ALLOWED_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '600' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, res.cors); return res.end(); }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return send(res, 200, await handler(req, url));
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    // static files (local dev; production frontend is on Firebase Hosting)
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.join(HERE, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(HERE, 'public'))) return send(res, 403, 'forbidden', 'text/plain');
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'not found', 'text/plain');
    return send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    let status = e.status && e.status < 600 ? e.status : 500, msg = e.message;
    if (e instanceof Anthropic.AuthenticationError) { status = 503; msg = 'The AI adviser is not configured on this server.'; }
    else if (e instanceof Anthropic.RateLimitError) { status = 503; msg = 'The AI adviser is busy. Please retry in a minute.'; }
    else if (e instanceof Anthropic.APIError) { status = 502; msg = 'The AI adviser had a problem. Please retry.'; }
    else if (e instanceof SyntaxError) { status = 400; msg = 'Bad request.'; }
    else if (!e.status) { status = 500; msg = 'Something went wrong on the server.'; }   // never leak internals
    console.error('[error]', req.method, url.pathname, e.message);
    send(res, status, { error: msg });
  }
});

/* ---------------- boot ---------------- */
await store.open();
const refresh = () => collect().then(() => Q.clearCache()).catch(e => console.error('[collect]', e));
const last = await store.lastRun();
console.log(`[db] ${store.db().kind}; last collection ${last?.started_at ? new Date(last.started_at).toISOString() : 'never'}`);
if (!last || Date.now() - new Date(last.started_at).getTime() > REFRESH_MS) refresh();
setInterval(refresh, REFRESH_MS).unref();
server.listen(PORT, HOST, () => console.log(`WillAI → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
