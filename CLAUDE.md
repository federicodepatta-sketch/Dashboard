# Just Russel — ad-account AI database

This repo is two things:

1. **The ad-account brain** (`db/`, `pipeline/`, `docs/schema/`, `sql/`) — a
   clean Supabase/Postgres database built around the ad **creative** as the
   unit, populated by a daily Meta Graph API pull. You answer questions about
   the account by **writing SQL against it**, not by parsing exports.
2. **Swing Monitor** (`src/`, `api/meta-swing.js`) — the existing day-over-day
   ad swing dashboard (Vite + React + a Vercel function). Unchanged.

## When asked a question about the ad account

**Before writing any SQL, read `docs/schema/tables.md` and
`docs/schema/querying.md`.** They define every table, its grain, and the rules
that keep answers correct. The non-negotiables:

- Fact tables hold **raw additive counts**; ratios (CTR, CPC, ROAS) are derived
  in views or from summed counts. **Never `AVG()` a ratio.**
- Any query touching `ad_conversions_daily` must filter **`attribution_model`
  and `customer_type`**, or go through `v_ad_roas`.
- The **creative** is the unit — aggregate ads to `creative_id` for creative
  questions, or use `v_creative_funnel`.
- AI tags, transcripts, visual descriptions, and creator/facial-recognition
  grouping are **not built yet**. If a question needs them, say so — don't
  invent columns.

Worked SQL for the canonical questions lives in `sql/examples/`. Start there,
then narrow with `WHERE` clauses and analyze the small result set.

## Layout

```
db/migrations/   Postgres DDL (apply in order) — see db/README.md
                 0004 = the repeat-query analyses as SQL functions
pipeline/        daily Meta → Supabase pull    — see pipeline/README.md
docs/schema/     table-by-table docs + querying guide  ← read these first
sql/examples/    worked SQL for Q1/Q2/Q3
api/             serverless functions: analysis.js (RPC dispatch), cron/, meta-swing.js
src/             Ad Intelligence dashboard (Intelligence.jsx) + Swing Monitor (App.jsx)
```

The **Ad Intelligence** dashboard reads `db/migrations/0004`'s functions via
`POST /api/analysis`. If you add a new repeat-query analysis, add it as a SQL
function there and a case in `api/analysis.js` so the dashboard and SQL stay in
lockstep.

Secrets go in `.env` (see `.env.example`) — never commit them.
