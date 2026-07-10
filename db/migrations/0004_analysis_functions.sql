-- =============================================================================
-- 0004_analysis_functions.sql — the repeat-query analyses, as SQL functions.
--
-- These back the visual dashboard (api/analysis.js calls them via RPC) AND are
-- callable directly (select * from analysis_funnel('video', ...)). Keeping the
-- logic in the database means the dashboard and an ad-hoc SQL session return the
-- SAME numbers. All revenue is at the Meta default model / all customers; ratios
-- are computed from summed counts, never averaged.
--
-- Date params default to the last 90 days when null.
-- =============================================================================

begin;

-- Q1 — funnel rungs for a category (creative format) over a window.
-- Returns one row per rung with the absolute count reached; the caller computes
-- drop-off between rungs and flags the biggest (spend is returned for weighting).
create or replace function analysis_funnel(
  p_format text default 'video', p_since date default null, p_until date default null)
returns table(step int, rung text, reached numeric, spend numeric)
language sql stable as $$
  with agg as (
    select
      sum(i.spend) as spend,
      sum(i.impressions) as impressions, sum(i.video_3s_views) as s3,
      sum(i.video_p25_views) as p25, sum(i.video_p50_views) as p50,
      sum(i.video_p75_views) as p75, sum(i.video_p95_views) as p95,
      sum(i.video_p100_views) as p100,
      sum(i.inline_link_clicks) as lc, sum(i.landing_page_views) as lpv,
      sum(coalesce(cv.add_to_cart,0)) as atc,
      sum(coalesce(cv.initiate_checkout,0)) as co,
      sum(coalesce(cv.purchases,0)) as pur
    from ad_insights_daily i
    join ads a       on a.id = i.ad_id
    join creatives cr on cr.id = a.creative_id
    left join ad_conversions_daily cv
           on cv.ad_id = i.ad_id and cv.date = i.date
          and cv.attribution_model = 'meta_7d_click_1d_view'
          and cv.customer_type = 'all'
    where (p_format is null or cr.format::text = p_format)
      and i.date >= coalesce(p_since, current_date - 90)
      and i.date <= coalesce(p_until, current_date)
  )
  select v.step, v.rung,
    (case v.step
      when 1 then agg.impressions when 2 then agg.s3  when 3 then agg.p25
      when 4 then agg.p50 when 5 then agg.p75 when 6 then agg.p95
      when 7 then agg.p100 when 8 then agg.lc when 9 then agg.lpv
      when 10 then agg.atc when 11 then agg.co when 12 then agg.pur
    end)::numeric as reached,
    agg.spend
  from agg
  cross join (values
    (1,'Impressions'),(2,'3s hook'),(3,'25%'),(4,'50%'),(5,'75%'),
    (6,'95%'),(7,'100%'),(8,'Link click'),(9,'Landing page'),
    (10,'Add to cart'),(11,'Checkout'),(12,'Purchase')
  ) as v(step, rung)
  order by v.step;
$$;

-- Q2 — creator performance (naming-convention grouping until facial rec lands).
create or replace function analysis_creators(
  p_since date default null, p_until date default null, p_min_spend numeric default 500)
returns table(creator text, active_days bigint, spend numeric, revenue numeric,
              roas numeric, purchases bigint, cpa numeric, ctr_pct numeric)
language sql stable as $$
  with tagged as (
    select lower(split_part(coalesce(cr.name, a.name), '_', 1)) as creator,
           i.date, i.spend, i.impressions, i.inline_link_clicks,
           coalesce(cv.revenue,0) as revenue, coalesce(cv.purchases,0) as purchases
    from ad_insights_daily i
    join ads a on a.id = i.ad_id
    left join creatives cr on cr.id = a.creative_id
    left join ad_conversions_daily cv
           on cv.ad_id = i.ad_id and cv.date = i.date
          and cv.attribution_model = 'meta_7d_click_1d_view'
          and cv.customer_type = 'all'
    where i.date >= coalesce(p_since, current_date - 90)
      and i.date <= coalesce(p_until, current_date)
  )
  select creator, count(distinct date), round(sum(spend),0), round(sum(revenue),0),
         round(sum(revenue)/nullif(sum(spend),0),2), sum(purchases)::bigint,
         round(sum(spend)/nullif(sum(purchases),0),2),
         round(100.0*sum(inline_link_clicks)/nullif(sum(impressions),0),2)
  from tagged
  where creator <> ''
  group by creator
  having sum(spend) > p_min_spend
  order by 5 desc nulls last;
$$;

-- Q3 — verdict: do Meta's quality rankings predict ROAS?
create or replace function analysis_meta_quality(
  p_since date default null, p_until date default null)
returns table(corr numeric, ads int, verdict text)
language sql stable as $$
  with scored as (
    select i.ad_id, i.spend, coalesce(cv.revenue,0) as revenue,
      case i.quality_ranking
        when 'ABOVE_AVERAGE' then 3 when 'AVERAGE' then 2
        when 'BELOW_AVERAGE_10' then 1 when 'BELOW_AVERAGE_20' then 1
        when 'BELOW_AVERAGE_35' then 0 else null end as qs
    from ad_insights_daily i
    left join ad_conversions_daily cv
           on cv.ad_id = i.ad_id and cv.date = i.date
          and cv.attribution_model = 'meta_7d_click_1d_view'
          and cv.customer_type = 'all'
    where i.date >= coalesce(p_since, current_date - 90)
      and i.date <= coalesce(p_until, current_date) and i.spend > 0
  ),
  per_ad as (
    select ad_id, sum(revenue)/nullif(sum(spend),0) as roas, avg(qs) as qs
    from scored where qs is not null group by ad_id having sum(spend) > 100
  ),
  s as (select corr(qs, roas) as r, count(*)::int as n from per_ad)
  select round(r::numeric,3), n,
    case when n < 20 then 'INSUFFICIENT DATA'
         when r >  0.2 then 'PREDICTS'
         when r < -0.2 then 'INVERTED'
         else 'NO SIGNAL' end
  from s;
$$;

-- Q3 supporting cut — mean ROAS by Meta quality tier.
create or replace function analysis_meta_quality_tiers(
  p_since date default null, p_until date default null)
returns table(quality_ranking text, ads bigint, roas numeric)
language sql stable as $$
  select coalesce(i.quality_ranking,'UNRATED'), count(distinct i.ad_id),
         round(sum(cv.revenue)/nullif(sum(i.spend),0),2)
  from ad_insights_daily i
  left join ad_conversions_daily cv
         on cv.ad_id = i.ad_id and cv.date = i.date
        and cv.attribution_model = 'meta_7d_click_1d_view'
        and cv.customer_type = 'all'
  where i.date >= coalesce(p_since, current_date - 90)
    and i.date <= coalesce(p_until, current_date) and i.spend > 0
  group by i.quality_ranking
  order by 3 desc nulls last;
$$;

-- KPI tiles for the dashboard header.
create or replace function analysis_overview(
  p_since date default null, p_until date default null)
returns table(spend numeric, revenue numeric, roas numeric, purchases bigint,
              active_ads bigint, active_creatives bigint)
language sql stable as $$
  select round(sum(i.spend),0), round(sum(coalesce(cv.revenue,0)),0),
         round(sum(coalesce(cv.revenue,0))/nullif(sum(i.spend),0),2),
         sum(coalesce(cv.purchases,0))::bigint,
         count(distinct i.ad_id), count(distinct a.creative_id)
  from ad_insights_daily i
  join ads a on a.id = i.ad_id
  left join ad_conversions_daily cv
         on cv.ad_id = i.ad_id and cv.date = i.date
        and cv.attribution_model = 'meta_7d_click_1d_view'
        and cv.customer_type = 'all'
  where i.date >= coalesce(p_since, current_date - 90)
    and i.date <= coalesce(p_until, current_date);
$$;

-- "Send me the three best" — top creatives by ROAS with their viewable link + copy.
create or replace function analysis_top_creatives(
  p_format text default null, p_since date default null, p_until date default null,
  p_min_spend numeric default 200, p_limit int default 10)
returns table(creative_id text, name text, format text, permalink_url text,
              title text, body text, spend numeric, revenue numeric,
              roas numeric, purchases bigint)
language sql stable as $$
  select cr.id, cr.name, cr.format::text, cr.permalink_url, cr.title, cr.body,
         round(sum(i.spend),0), round(sum(coalesce(cv.revenue,0)),0),
         round(sum(coalesce(cv.revenue,0))/nullif(sum(i.spend),0),2),
         sum(coalesce(cv.purchases,0))::bigint
  from ad_insights_daily i
  join ads a on a.id = i.ad_id
  join creatives cr on cr.id = a.creative_id
  left join ad_conversions_daily cv
         on cv.ad_id = i.ad_id and cv.date = i.date
        and cv.attribution_model = 'meta_7d_click_1d_view'
        and cv.customer_type = 'all'
  where (p_format is null or cr.format::text = p_format)
    and i.date >= coalesce(p_since, current_date - 90)
    and i.date <= coalesce(p_until, current_date)
  group by cr.id, cr.name, cr.format, cr.permalink_url, cr.title, cr.body
  having sum(i.spend) > p_min_spend
  order by 9 desc nulls last
  limit p_limit;
$$;

commit;
