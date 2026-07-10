-- =============================================================================
-- Q2 — "Which specific creator actually drives results?"
--
-- NOTE ON THE FOUNDATION LAYER: facial-recognition creator tagging is the FULL
-- version. Until that table exists, we group by the creator token embedded in
-- the ad / creative NAME (the article calls this the historical convention).
-- When you add facial recognition later, swap the `creator` expression below
-- for a join to creative_creators; every other line stays the same.
-- =============================================================================

-- Assumes ad names follow a convention like "creatorname_angle_format_v3".
-- Adjust split_part / regex to your naming scheme.
with tagged as (
  select
    lower(split_part(coalesce(cr.name, a.name), '_', 1)) as creator,
    i.date, i.spend, i.impressions, i.inline_link_clicks,
    coalesce(cv.revenue,0)   as revenue,
    coalesce(cv.purchases,0) as purchases
  from ad_insights_daily i
  join ads a         on a.id = i.ad_id
  left join creatives cr on cr.id = a.creative_id
  left join ad_conversions_daily cv
         on cv.ad_id = i.ad_id and cv.date = i.date
        and cv.attribution_model = 'meta_7d_click_1d_view'
        and cv.customer_type = 'all'
  where i.date >= current_date - interval '90 days'
)
select
  creator,
  count(distinct date)                                   as active_days,
  round(sum(spend), 0)                                   as spend,
  round(sum(revenue), 0)                                 as revenue,
  round(sum(revenue) / nullif(sum(spend),0), 2)          as roas,   -- ratio from sums, not avg-of-ratios
  sum(purchases)                                         as purchases,
  round(sum(spend) / nullif(sum(purchases),0), 2)        as cpa,
  round(100.0 * sum(inline_link_clicks) / nullif(sum(impressions),0), 2) as ctr_pct
from tagged
where creator <> ''
group by creator
having sum(spend) > 500                     -- ignore creators with trivial spend
order by roas desc nulls last;
