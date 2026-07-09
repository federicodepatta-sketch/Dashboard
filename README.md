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
