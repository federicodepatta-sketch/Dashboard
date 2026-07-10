-- =============================================================================
-- Q1 — "Which rung is the leak?"
-- Full path impression -> 3s hook -> 25/50/75/95/100% -> link click ->
-- landing page view -> add-to-cart -> checkout -> purchase, per creative,
-- with the single biggest drop flagged and weighted by spend.
-- =============================================================================

-- --- 1a. The funnel for ONE creative, rung by rung, with step conversion ----
-- Replace :creative_id.
with f as (
  select * from v_creative_funnel where creative_id = :'creative_id'
),
rungs as (
  select creative_id, creative_name, spend, unnest(array[
    'impressions','3s_hook','p25','p50','p75','p95','p100',
    'link_click','landing_page_view','add_to_cart','checkout','purchase'
  ]) as rung,
  unnest(array[
    impressions, video_3s_views, p25, p50, p75, p95, p100,
    link_clicks, landing_page_views, add_to_cart, checkout, purchases
  ]) as reached,
  generate_series(1,12) as step
  from f
)
select
  step, rung, reached,
  lag(reached) over (order by step)                                              as prev_reached,
  round(100.0 * reached / nullif(lag(reached) over (order by step),0), 1)        as step_conv_pct,
  round(100.0 - 100.0 * reached / nullif(lag(reached) over (order by step),0),1) as drop_pct
from rungs
order by step;

-- --- 1b. Across a CATEGORY (e.g. all video creatives): the biggest leak, ------
--         weighted by spend. Returns the rung with the largest spend-weighted
--         drop-off so you know where to spend fixing effort.
with agg as (
  select
    sum(spend) as spend,
    sum(impressions) as impressions, sum(video_3s_views) as s3,
    sum(p25) p25, sum(p50) p50, sum(p75) p75, sum(p95) p95, sum(p100) p100,
    sum(link_clicks) lc, sum(landing_page_views) lpv,
    sum(add_to_cart) atc, sum(checkout) co, sum(purchases) pur
  from v_creative_funnel
  where creative_format = 'video'      -- <- your category filter
),
steps(step, rung, num, den) as (
  select 1, 'impression -> 3s hook',        s3,   impressions from agg
  union all select 2, '3s -> 25%',          p25,  s3   from agg
  union all select 3, '25% -> 50%',         p50,  p25  from agg
  union all select 4, '50% -> 75%',         p75,  p50  from agg
  union all select 5, '75% -> 95%',         p95,  p75  from agg
  union all select 6, '95% -> 100%',        p100, p95  from agg
  union all select 7, '100% -> link click', lc,   p100 from agg
  union all select 8, 'click -> LPV',       lpv,  lc   from agg
  union all select 9, 'LPV -> add-to-cart', atc,  lpv  from agg
  union all select 10,'ATC -> checkout',    co,   atc  from agg
  union all select 11,'checkout -> purchase',pur, co   from agg
)
select
  rung,
  num, den,
  round(100.0 * num / nullif(den,0), 1)         as pass_pct,
  round(100.0 - 100.0 * num / nullif(den,0),1)  as drop_pct,
  (den - num)                                    as lost_users
from steps
order by (den - num) desc            -- biggest absolute leak first
limit 3;
