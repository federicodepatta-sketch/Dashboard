# Pipeline — daily Meta → Supabase pull

Pulls ad-level Meta insights every morning and upserts them into the schema in
`db/migrations`. Idempotent (all writes are upserts keyed on the fact-table
primary keys), so re-running a day or backfilling a range is safe.

## Setup

1. Apply the migrations (`db/README.md`).
2. Copy `.env.example` → `.env` and fill in `META_ACCESS_TOKEN`,
   `META_AD_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Install deps: `npm install`.

## Run

```bash
node pipeline/meta-daily-pull.mjs                      # yesterday
node pipeline/meta-daily-pull.mjs --date 2026-07-09    # one specific day
node pipeline/meta-daily-pull.mjs --since 2026-06-01 --until 2026-06-30   # backfill a range
```

Load the `.env` first (e.g. `node --env-file=.env pipeline/meta-daily-pull.mjs`
on Node 20+, or use your own loader).

## Scheduling (every morning)

Deployed on Vercel, `api/cron/daily-meta-pull.js` runs the pull and
`vercel.json` schedules it at `0 6 * * *` (06:00 UTC). Set `CRON_SECRET` in the
Vercel project so only Vercel's cron can trigger it. To run the morning pull
elsewhere (GitHub Actions, a Supabase edge function, a box with cron), just call
`node pipeline/meta-daily-pull.mjs` on a schedule with the env vars set.

## What it writes

- **Dimensions** every run: `accounts`, `campaigns` (with derived `market`),
  `ad_sets`, `creatives` (dedup'd from the ad→creative expansion), `ads`.
- **Facts** for the window: `ad_insights_daily` (delivery + video funnel + Meta
  rankings) and `ad_conversions_daily` (revenue/purchases at the Meta default
  attribution model, `customer_type='all'`).
- **Lifecycle**: recomputes `ads.first_active_date` / `last_active_date` from the
  fact table after each run.

## Files

| File | Purpose |
| --- | --- |
| `meta-fields.mjs` | Graph field lists + pure mappers (action array → columns, market, format). Unit-testable. |
| `meta-daily-pull.mjs` | Orchestration: fetch dims + insights, map, upsert. Exposes `run()` and a CLI. |

## Notes / limits (foundation)

- New-vs-returning split and non-Meta attribution models are **not** populated
  yet — those come from Northbeam/TripleWhale in a later layer. Rows land under
  `customer_type='all'` and `attribution_model='meta_7d_click_1d_view'`.
- `permalink_url` is built from the creative's `effective_object_story_id`.
  Ads without a story id get `NULL`.
