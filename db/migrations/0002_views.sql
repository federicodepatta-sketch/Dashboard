-- =============================================================================
-- 0002_views.sql — Derived views. Ratios are computed HERE, never stored.
-- =============================================================================
-- Convention for choosing an attribution model in the views below:
--   revenue/ROAS default to 'meta_7d_click_1d_view' + customer_type='all'.
--   When you need a different model, query ad_conversions_daily directly and
--   filter attribution_model / customer_type yourself.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- v_ad_daily — one row per ad per day, fully joined, with derived ratios.
-- Safe to filter/aggregate; the ratio columns are for single-row reading only.
-- To aggregate ratios across rows, re-derive from the summed count columns.
-- ---------------------------------------------------------------------------
create or replace view v_ad_daily as
select
  i.date,
  a.id                as ad_id,
  a.name              as ad_name,
  a.creative_id,
  cr.name             as creative_name,
  cr.format           as creative_format,
  cr.permalink_url,
  cr.thumbnail_url,
  a.campaign_id,
  c.name              as campaign_name,
  c.market,
  a.ad_set_id,
  s.name              as ad_set_name,
  a.account_id,
  -- raw counts (SUM-safe)
  i.spend,
  i.impressions,
  i.reach,
  i.clicks,
  i.inline_link_clicks,
  i.landing_page_views,
  i.video_plays,
  i.video_3s_views,
  i.video_p25_views,
  i.video_p50_views,
  i.video_p75_views,
  i.video_p95_views,
  i.video_p100_views,
  i.video_thruplays,
  i.quality_ranking,
  i.engagement_rate_ranking,
  i.conversion_rate_ranking,
  -- derived ratios (single-row only)
  case when i.impressions > 0 then i.inline_link_clicks::numeric / i.impressions end            as ctr,
  case when i.inline_link_clicks > 0 then i.spend / i.inline_link_clicks end                    as cpc,
  case when i.impressions > 0 then i.spend / i.impressions * 1000 end                           as cpm,
  case when i.impressions > 0 then i.video_3s_views::numeric / i.impressions end                as hook_rate,
  case when i.video_3s_views > 0 then i.video_p100_views::numeric / i.video_3s_views end        as completion_rate
from ad_insights_daily i
join ads a       on a.id = i.ad_id
left join creatives cr on cr.id = a.creative_id
left join campaigns c  on c.id = a.campaign_id
left join ad_sets   s  on s.id = a.ad_set_id;

-- ---------------------------------------------------------------------------
-- v_ad_roas — spend joined to revenue at the DEFAULT Meta model, all customers.
-- One row per ad per day. Use this for quick ROAS/CPA; for other attribution
-- models or new-vs-returning, query ad_conversions_daily directly.
-- ---------------------------------------------------------------------------
create or replace view v_ad_roas as
select
  i.date,
  a.id                as ad_id,
  a.name              as ad_name,
  a.creative_id,
  a.campaign_id,
  c.market,
  i.spend,
  coalesce(cv.revenue, 0)   as revenue,
  coalesce(cv.purchases, 0) as purchases,
  case when i.spend > 0 then coalesce(cv.revenue,0) / i.spend end   as roas,
  case when cv.purchases > 0 then i.spend / cv.purchases end        as cpa,
  case when cv.purchases > 0 then cv.revenue / cv.purchases end     as aov
from ad_insights_daily i
join ads a        on a.id = i.ad_id
left join campaigns c on c.id = a.campaign_id
left join ad_conversions_daily cv
       on cv.ad_id = i.ad_id
      and cv.date  = i.date
      and cv.attribution_model = 'meta_7d_click_1d_view'
      and cv.customer_type     = 'all';

-- ---------------------------------------------------------------------------
-- v_creative_funnel — the full impression -> purchase funnel, aggregated per
-- creative across all its ads and all dates. Each rung is an absolute count so
-- you can weight leaks by spend. Revenue/purchases at default Meta model, all.
-- ---------------------------------------------------------------------------
create or replace view v_creative_funnel as
select
  cr.id            as creative_id,
  cr.name          as creative_name,
  cr.format        as creative_format,
  cr.permalink_url,
  sum(i.spend)                 as spend,
  sum(i.impressions)           as impressions,
  sum(i.video_plays)           as video_plays,
  sum(i.video_3s_views)        as video_3s_views,
  sum(i.video_p25_views)       as p25,
  sum(i.video_p50_views)       as p50,
  sum(i.video_p75_views)       as p75,
  sum(i.video_p95_views)       as p95,
  sum(i.video_p100_views)      as p100,
  sum(i.inline_link_clicks)    as link_clicks,
  sum(i.landing_page_views)    as landing_page_views,
  sum(coalesce(cv.add_to_cart,0))       as add_to_cart,
  sum(coalesce(cv.initiate_checkout,0)) as checkout,
  sum(coalesce(cv.purchases,0))         as purchases,
  sum(coalesce(cv.revenue,0))           as revenue
from ad_insights_daily i
join ads a            on a.id = i.ad_id
join creatives cr     on cr.id = a.creative_id
left join ad_conversions_daily cv
       on cv.ad_id = i.ad_id
      and cv.date  = i.date
      and cv.attribution_model = 'meta_7d_click_1d_view'
      and cv.customer_type     = 'all'
group by cr.id, cr.name, cr.format, cr.permalink_url;

commit;
