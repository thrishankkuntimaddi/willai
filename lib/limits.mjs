// Rate limits. Counters live in the database (hourly buckets), so they survive restarts, Render's sleep and more than one server.
import { db } from './db.mjs';

// Counts one request against `key` in the current hour; true while the count is within `max`.
export async function hit(key, max) {
  const [{ n }] = await db().q(`insert into rate_hits (key, hour, n) values ($1, date_trunc('hour', now()), 1)
    on conflict (key, hour) do update set n = rate_hits.n + 1 returning n`, [String(key).slice(0, 200)]);
  return n <= max;
}
export async function limit(key, max, message) {
  if (!(await hit(key, max))) throw Object.assign(new Error(message), { status: 429 });
}

// IPv6 users usually hold a whole /64, so they are counted per /64 rather than per address.
function v6prefix(ip) {
  const [head, tail] = ip.split('::');
  const a = head ? head.split(':') : [], b = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return full.slice(0, 4).map(x => (x || '0').toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
export const clientKey = ip => {
  const s = String(ip || '?').trim().replace(/^::ffff:/i, '');
  return s.includes(':') ? v6prefix(s) : s;
};

// The client address. Proxies append to X-Forwarded-For, so only the entries they added can be trusted: the last one with a single
// proxy (Render), the Nth from the end with N proxies (TRUST_PROXY_HOPS). Everything before that is whatever the client typed.
// CLIENT_IP_HEADER names a header the proxy sets itself (for example true-client-ip), which wins when present.
export function ipOf(req, env = process.env) {
  const own = env.CLIENT_IP_HEADER && req.headers[env.CLIENT_IP_HEADER.toLowerCase()];
  if (own) return clientKey(String(own).split(',')[0]);
  const hops = Math.max(0, Number(env.TRUST_PROXY_HOPS ?? 1) || 0);
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return clientKey((hops && xff.length >= hops ? xff[xff.length - hops] : '') || req.socket?.remoteAddress);
}
