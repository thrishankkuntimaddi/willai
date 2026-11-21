# WillAI

See what AI can do in your job, and where to go next.

For nurses, farmers, accountants, drivers, engineers and every other trade. WillAI compares your work with
**today's live job openings**, shows which of your tasks AI already handles, suggests roles you could move into
(each backed by real open positions), and gives you a 90-day plan you can tick off. It is also a job portal:
search live openings, save the ones you like, and employers can post roles of their own.

## What's inside

| Part | What it does |
|---|---|
| **Analyse** | Gemini (or Claude) reads your profile next to the most relevant live openings and returns a task-by-task exposure score, what stays human, skills to learn, roles to move into and a 90-day plan |
| **Jobs** | Search and filter thousands of live openings, save them to your account, apply on the company's page |
| **For employers** | Employers sign up and post roles, which appear next to live openings for everyone |
| **Market** | AI skill demand, new AI-era job titles, who is hiring, source health, all computed from live postings |
| **Account** | Google or email sign-in. Reports, plan progress and saved jobs follow you across devices |

## Architecture

```
Firebase Hosting (public/)  ──►  Render: server.mjs ──► lib/collect.mjs ──► 248 company job boards + open boards + aggregators (every 6 h)
        │                               │                lib/normalize.mjs  role family, seniority, work mode, city/country, skills, salary
        │                               │                lib/trust.mjs      scam and low-quality signals, with reasons
        │                               ├──────────────► Postgres (Supabase), or embedded PGlite when DATABASE_URL is unset
        │                               └──────────────► Gemini / Claude / Ollama (lib/llm.mjs, lib/advise.mjs)
        └──►  Firebase Auth + Cloud Firestore (accounts, reports, saved jobs)
```

- Postings are **never deleted**. Each run upserts what it sees; postings that disappear from a company board are marked `closed`,
  old ones `stale` (ATS roles after 120 days, aggregator roles after 45). The site shows only active postings unless you ask for older ones.
- `/api/jobs` supports keyword (with job-title synonyms), role family, seniority, work mode (remote/hybrid/onsite), city with radius,
  country, employment type, posted-within, company category, salary listed, AI skills, and facet counts.
- `public/`: plain HTML, CSS and ES modules, no build step. `public/data/` holds the skill and city dictionaries shared with the server.

## Run locally

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY (free key from aistudio.google.com)
npm start                   # http://localhost:8787 ; first start collects ~30k postings in about 2 minutes
npm test                    # unit + database tests (in-memory Postgres)
npm run test:rules          # Firestore rules against the emulator (needs Java)
```

AI provider is picked automatically: `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` → local Ollama (`ollama pull qwen2.5:3b`).
Without any, jobs and market pages still work.

## Deploy

1. **Database (Supabase, free):** create a project, copy *Project settings → Database → Connection string → Transaction pooler* (port 6543).
   Optionally fill it once from your machine: `DATABASE_URL=... npm run collect`.
2. **Backend on Render (free):** New → Blueprint → select this repo (`render.yaml`). Set `GEMINI_API_KEY`, `DATABASE_URL` and any aggregator
   keys in the service's Environment tab. If the service URL is not `https://willai-api-doyy.onrender.com`, update `apiBase` in `public/config.js`
   and the `API_URL` repository variable used by `.github/workflows/keepalive.yml`.
3. **Frontend + rules on Firebase:** `firebase deploy --only hosting,firestore:rules`
4. In Firebase Console → Authentication → Settings → Authorized domains, make sure `willai-564c9.web.app` is listed.

The free Render plan sleeps after 15 idle minutes. `.github/workflows/keepalive.yml` pings it every 10 minutes, and the site shows
"waking the job board" instead of empty pages if it is still asleep.

## Live data sources (official public APIs, no scraping)

- **248 company career boards** on Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Recruitee, grouped into AI labs, developer tools,
  big tech, fintech, Indian product companies, SaaS, security, mobility, healthtech, gaming and hardware (`sources.json`;
  check tokens with `npm run check-sources`).
- **Open boards:** Himalayas, Remotive, Arbeitnow, RemoteOK, Jobicy, The Muse.
- **Aggregators with free keys** (enabled when the key is set): Adzuna (IT jobs in India, US, UK, Singapore, Germany, Canada, Australia),
  Jooble (tech keywords, India and remote), USAJobs (IT series 2210), Reed (UK).
- LinkedIn and Naukri have no public job APIs and their terms forbid scraping, so WillAI does not use them.

## Security

- AI keys live only on the server (`.env` is git-ignored)
- `/api/advise` is rate-limited: 3 per hour per IP when signed out, 12 per hour per signed-in user (Firebase ID tokens verified with Google's public keys)
- Strict Content-Security-Policy, CORS limited to the app's own domains, request size and field length caps
- Job-ad text is passed to the model as untrusted data
- Firestore rules tested: users can only read their own data, only employers can post, only the poster can edit or delete, apply links must be `https://` or `mailto:`

## Credits

Design pass guided by [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
