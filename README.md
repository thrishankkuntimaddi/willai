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
Firebase Hosting (public/)  ──►  Render: server.mjs  ──►  job-board APIs (every 6 h, cached)
        │                                    └──────────►  Gemini / Claude / Ollama
        └──►  Firebase Auth + Cloud Firestore (reports, saved jobs, employer postings)
```

- `server.mjs`: collects postings, computes market signals, serves `/api/trends`, `/api/market`, `/api/jobs`, `/api/advise`
- `public/`: plain HTML, CSS and ES modules, no build step
- `firestore.rules`: owners-only access to accounts and reports; only employers post jobs; field validation

## Run locally

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY (free key from aistudio.google.com)
npm start                   # http://localhost:8787
```

AI provider is picked automatically: `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` → local Ollama (`ollama pull qwen2.5:3b`).
Without any, jobs and market pages still work.

## Deploy

1. **Backend on Render (free):** New → Blueprint → select this repo (`render.yaml`). Set `GEMINI_API_KEY` in the
   service's Environment tab. If the service URL is not `https://willai-api-doyy.onrender.com`, update `apiBase` in `public/config.js`.
2. **Frontend + rules on Firebase:** `firebase deploy --only hosting,firestore:rules`
3. In Firebase Console → Authentication → Settings → Authorized domains, make sure `willai-564c9.web.app` is listed.

The free Render plan sleeps after 15 minutes idle; the first request after that takes about 30 seconds.

## Live data sources (official public APIs, no scraping)

Greenhouse, Lever and Ashby job boards (Anthropic, OpenAI, Stripe, Databricks, Airbnb, Groww, Meesho, CRED and more,
configurable in `sources.json`), Himalayas (also live per-query search), Remotive, Arbeitnow, RemoteOK, Jobicy, and
optionally Adzuna (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`).

## Security

- AI keys live only on the server (`.env` is git-ignored)
- `/api/advise` is rate-limited: 3 per hour per IP when signed out, 12 per hour per signed-in user (Firebase ID tokens verified with Google's public keys)
- Strict Content-Security-Policy, CORS limited to the app's own domains, request size and field length caps
- Job-ad text is passed to the model as untrusted data
- Firestore rules tested: users can only read their own data, only employers can post, only the poster can edit or delete, apply links must be `https://` or `mailto:`

## Credits

Design pass guided by [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
