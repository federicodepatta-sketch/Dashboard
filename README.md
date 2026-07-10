# Just Russel — ad-account AI database & Swing Monitor

This repo holds two things:

1. **Ad-account AI database** (`db/`, `pipeline/`, `docs/schema/`, `sql/`) — the
   foundation layer of the account brain from the build-it-yourself plan. A
   clean Supabase/Postgres schema centered on the ad **creative**, populated by
   a **daily Meta Graph API pull**, that Claude answers questions against by
   **writing real SQL** instead of parsing exports. Start at
   [`docs/schema/README.md`](docs/schema/README.md); `CLAUDE.md` tells the
   querying agent how to use it.
2. **Swing Monitor** (below) — the existing day-over-day ad swing dashboard.

## Ad-account database — quick start

```bash
# 1. apply the schema to your Supabase project (see db/README.md)
psql "$DATABASE_URL" -f db/migrations/0001_core_schema.sql
psql "$DATABASE_URL" -f db/migrations/0002_views.sql
psql "$DATABASE_URL" -f db/migrations/0003_functions.sql
psql "$DATABASE_URL" -f db/migrations/0004_analysis_functions.sql

# 2. configure secrets, then run the daily pull (see pipeline/README.md)
cp .env.example .env    # fill in Meta + Supabase creds
npm install
npm run pull            # backfill: node pipeline/meta-daily-pull.mjs --since ... --until ...
```

On Vercel the pull runs every morning via `vercel.json`'s cron
(`0 6 * * *` → `api/cron/daily-meta-pull.js`).

### Ad Intelligence dashboard

The **Ad Intelligence** tab (the default view; Swing Monitor is the second tab)
is the visual half of the unlock — repeat queries you don't want to re-type. It
reads the analyses in `db/migrations/0004` through `POST /api/analysis` (which
runs them server-side against Supabase, keeping the service-role key off the
client) and renders four panels: the funnel-leak diagnosis, creator ROAS,
Meta-quality-vs-ROAS verdict, and top creatives with viewable links. With
Supabase unset it falls back to bundled demo data so the UI always renders.
Each panel is exactly one SQL function, so the dashboard and an ad-hoc question
to Claude return the same numbers.

---

# Swing Monitor · Just Russel

Ad-level, day-over-day **swing monitor** for Just Russel's Meta ads. It ranks
the ads whose spend, CTR or CPC moved the most between the two most recent
complete days, flags large swings, and lets you filter by market and metric.

Built with **Vite + React 18 + Tailwind CSS**, with a **Vercel serverless
function** that proxies the Anthropic Messages API (keeping API keys
server-side) and uses the Meta MCP toolset to pull the live data.

## Project structure

```
.
├── index.html            # Vite entry — loads /src/main.jsx
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── api/
│   └── meta-swing.js     # Vercel function → POST /api/meta-swing
└── src/
    ├── main.jsx          # React entry
    ├── App.jsx           # Dashboard UI
    └── index.css         # Tailwind directives + base styles
```

## Getting started

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

> The Vite dev server does not run the `api/` serverless function. To exercise
> the live **Pull data** flow locally, use the Vercel CLI (`vercel dev`), or use
> **Paste** mode in the UI to load an exported JSON payload.

## Environment variables

The live pull (`/api/meta-swing`) needs these set in your deployment
environment (e.g. Vercel Project → Settings → Environment Variables). Keep them
out of the repo — never commit a `.env` file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Server-side key for the Anthropic Messages API |
| `META_MCP_TOKEN` | yes (for live pull) | Auth token for the Meta ads MCP server |
| `ANTHROPIC_MODEL` | no | Model override (defaults to `claude-sonnet-4-5`) |

Without `META_MCP_TOKEN`, the live pull is disabled and the UI falls back to
**Paste** mode.

## Deploying to Vercel

1. Import the repository into Vercel.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Add the environment variables above.
4. Deploy — the `api/meta-swing.js` function is served automatically at
   `/api/meta-swing`.
