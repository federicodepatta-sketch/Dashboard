# How to answer questions against this database

Instructions for the querying agent (you). The workflow that stops
hallucination is always the same: **filter down → pull the exact rows with SQL
→ analyze only what you pulled.** Never eyeball a large result set and estimate.

## The loop

1. **Read `tables.md` first.** Identify which table holds the answer and its
   grain. If the question needs AI tags / transcripts / creators, they don't
   exist yet — say so instead of inventing columns.
2. **Write SQL to isolate the rows.** Push every filter (date range, market,
   format, spend floor) into the `WHERE` clause so the result set is small and
   specific. Prefer the views for ratios; go to the fact tables to aggregate.
3. **Analyze the small result set qualitatively.** Now that the data is narrow
   and correct, reason about it.

## Rules that keep it accurate

- **Never average a ratio.** Aggregate the raw counts and divide the sums.
  `SUM(revenue)/SUM(spend)`, not `AVG(roas)`.
- **Always pin attribution.** Any query touching `ad_conversions_daily` must
  filter `attribution_model` and `customer_type`, or join through `v_ad_roas`
  (which pins the Meta default). Comparing models? Query each explicitly.
- **Aggregate to the creative for creative questions.** Many ads share one
  creative; roll up via `ads.creative_id` or use `v_creative_funnel`.
- **Respect the grain.** Joining `ad_insights_daily` to `ad_conversions_daily`
  must be on `(ad_id, date)` AND the model/customer filter, else you fan out
  rows across models and double-count spend.
- **Use spend as the tiebreaker.** "Biggest leak / worst performer" almost
  always means spend-weighted. Rank by absolute lost users or spend at risk,
  not by percentage on a €5 ad.
- **Date discipline.** Metrics are daily snapshots. Use `date BETWEEN … AND …`;
  "live / this morning" = the most recent complete `date` present.

## Worked examples

| Question | File |
| --- | --- |
| Q1 — which rung is the leak (per creative & per category, spend-weighted) | `sql/examples/q1_funnel_leak.sql` |
| Q2 — which creator drives results (naming-convention until facial rec) | `sql/examples/q2_creator_performance.sql` |
| Q3 — do Meta's quality rankings predict ROAS (verdict per account) | `sql/examples/q3_meta_quality_vs_results.sql` |

## The "ask it anything" pattern

> "Go to this brand, pull the top ads in this category, tell me what's working
> and what the selling points are, then send me the three best."

Decompose it: (1) filter to the account/brand + category (`creatives.format` or
a `name`/`search_tsv` match); (2) rank by `v_ad_roas` over a recent window with
a spend floor; (3) read `creatives.title`/`body` and the funnel for the top 3 to
describe the selling points; (4) return the three `permalink_url`s. Each step is
one small, checkable query — that is the whole point.
