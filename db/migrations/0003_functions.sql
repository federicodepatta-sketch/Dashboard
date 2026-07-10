-- =============================================================================
-- 0003_functions.sql — helper routines the pipeline calls.
-- =============================================================================

begin;

-- Recompute ads.first_active_date / last_active_date from the fact table.
-- Server-side so it scales past PostgREST's row cap; called once per pull run.
create or replace function refresh_ad_lifecycle()
returns void
language sql
as $$
  update ads a
     set first_active_date = b.first_date,
         last_active_date  = b.last_date
    from (
      select ad_id, min(date) as first_date, max(date) as last_date
        from ad_insights_daily
       group by ad_id
    ) b
   where b.ad_id = a.id;
$$;

commit;
