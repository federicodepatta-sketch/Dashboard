-- =============================================================================
-- Q3 — "Should I even trust Meta's quality rankings?"
-- Correlate Meta's own quality_ranking against actual ROAS, per account, and
-- return a verdict: PREDICTS / NO SIGNAL / INVERTED.
-- =============================================================================

-- Meta returns rankings as text tiers. Map them to an ordinal score so we can
-- correlate. Higher score = Meta thinks the ad is better.
with scored as (
  select
    i.ad_id, i.date, i.spend,
    coalesce(cv.revenue,0) as revenue,
    case i.quality_ranking
      when 'ABOVE_AVERAGE'      then 3
      when 'AVERAGE'            then 2
      when 'BELOW_AVERAGE_10'   then 1
      when 'BELOW_AVERAGE_20'   then 1
      when 'BELOW_AVERAGE_35'   then 0
      else null
    end as quality_score
  from ad_insights_daily i
  left join ad_conversions_daily cv
         on cv.ad_id = i.ad_id and cv.date = i.date
        and cv.attribution_model = 'meta_7d_click_1d_view'
        and cv.customer_type = 'all'
  where i.date >= current_date - interval '90 days'
    and i.spend > 0
),
per_ad as (   -- one ROAS + one modal-ish quality score per ad
  select
    ad_id,
    sum(revenue) / nullif(sum(spend),0) as roas,
    avg(quality_score)                  as quality_score
  from scored
  where quality_score is not null
  group by ad_id
  having sum(spend) > 100
),
stats as (
  select corr(quality_score, roas) as r, count(*) as n from per_ad
)
select
  round(r::numeric, 3)  as quality_vs_roas_corr,
  n                     as ads_considered,
  case
    when n < 20            then 'INSUFFICIENT DATA'
    when r >  0.20         then 'PREDICTS'      -- higher Meta rating -> higher ROAS
    when r < -0.20         then 'INVERTED'      -- higher Meta rating -> LOWER ROAS
    else                        'NO SIGNAL'
  end as verdict
from stats;

-- Optional supporting cut: mean ROAS by quality tier.
select
  i.quality_ranking,
  count(distinct i.ad_id)                                   as ads,
  round(sum(cv.revenue) / nullif(sum(i.spend),0), 2)        as roas
from ad_insights_daily i
left join ad_conversions_daily cv
       on cv.ad_id = i.ad_id and cv.date = i.date
      and cv.attribution_model = 'meta_7d_click_1d_view'
      and cv.customer_type = 'all'
where i.date >= current_date - interval '90 days' and i.spend > 0
group by i.quality_ranking
order by roas desc nulls last;
