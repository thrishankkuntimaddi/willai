// One-off collection run, e.g. to fill a fresh Supabase database: DATABASE_URL=... npm run collect
import * as store from '../lib/db.mjs';
import { collect } from '../lib/collect.mjs';

await store.open();
const run = await collect();
console.log(JSON.stringify({ total: run.total, tookMs: run.tookMs, failed: run.sources.filter(s => !s.ok) }, null, 2));
console.log(await store.sizeInfo());
await store.close();
