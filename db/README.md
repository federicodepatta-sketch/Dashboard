# Database migrations

Plain SQL for Postgres 15+ / Supabase. Apply in filename order.

## Apply

**Supabase SQL editor:** paste each file in `migrations/` in order and run.

**psql / Supabase CLI:**

```bash
# against a connection string (find it in Supabase → Project Settings → Database)
psql "$DATABASE_URL" -f db/migrations/0001_core_schema.sql
psql "$DATABASE_URL" -f db/migrations/0002_views.sql
psql "$DATABASE_URL" -f db/migrations/0003_functions.sql

# or, with the Supabase CLI and files placed under supabase/migrations/
supabase db push
```

Migrations are idempotent where practical (`create table if not exists`,
`create or replace view`, guarded enum creation), so re-running is safe.

## Files

| File | What it creates |
| --- | --- |
| `0001_core_schema.sql` | enums, `attribution_models`, dimensions (`accounts`, `campaigns`, `ad_sets`, `creatives`, `ads`), fact tables (`ad_insights_daily`, `ad_conversions_daily`), indexes |
| `0002_views.sql` | `v_ad_daily`, `v_ad_roas`, `v_creative_funnel` — ratios derived here, never stored |
| `0003_functions.sql` | `refresh_ad_lifecycle()` — recomputes ad first/last active dates from the facts |

See `docs/schema/` for how each table is meant to be used.
