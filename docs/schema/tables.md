# Schema reference — how each table works

> This is the file the article calls the real unlock. Claude reads it, filters
> down to the right table, writes SQL to isolate the exact rows, and only then
> analyzes. No parsing a pile of exports, no hallucinating.

## The one rule that keeps answers accurate

**Fact tables store raw additive counts only. Every ratio is derived in SQL.**

You may `SUM(spend)`, `SUM(impressions)`, `SUM(inline_link_clicks)` across any
set of rows and divide the sums. You may **never** `AVG()` a pre-computed CTR,
CPC, or ROAS — averaging ratios weights a €5 ad the same as a €5,000 ad and is
almost always wrong. The views (`v_ad_daily`, `v_ad_roas`) expose ratio columns
for **single-row reading**; to aggregate, go back to the count columns.

## Grain cheat-sheet

| Table | One row per | Additive? |
| --- | --- | --- |
| `accounts` | ad account | dimension |
| `campaigns` | campaign | dimension |
| `ad_sets` | ad set | dimension |
| `creatives` | **creative (the unit)** | dimension |
| `ads` | ad (creative × ad set placement) | dimension |
| `ad_insights_daily` | ad × day | yes (except `frequency`) |
| `ad_conversions_daily` | ad × day × attribution_model × customer_type | yes |

## Dimensions

### `accounts`
Meta ad account. `id` is digits only (no `act_` prefix); the pipeline adds the
prefix when calling Graph. `2560104667542234` is Just Russel.

### `campaigns`
`market` is derived from the campaign name's locale token by the pipeline
(`_nl_nl_` → `NL`, `_be_nl_` → `BE-NL`, `_be_fr_` → `BE-FR`, `_fr_fr_` → `FR`,
`_de_de_` → `DE`, else `OTHER`). Filter on `market` rather than re-parsing names.

### `ad_sets`
Links to `campaigns`. `optimization_goal` tells you what Meta was bidding
toward (e.g. `OFFSITE_CONVERSIONS`).

### `creatives` — the unit everything hangs off
One row per reusable creative asset; **many ads can share one creative**, so
always aggregate metrics to the creative via `ads.creative_id` when you want
"how does this creative perform" rather than "how does this ad perform".
- `permalink_url` — the link you can **view / embed** (built from the story id).
- `thumbnail_url` — preview image.
- `format` — `video | image | carousel | collection | dpa | other`.
- `title` / `body` — the ad copy. **Searchable** via `search_tsv`
  (`WHERE search_tsv @@ plainto_tsquery('simple', 'grain free')`) or fuzzy on
  `name` (`WHERE name ILIKE '%bowl%'`). Visual descriptions and AI tags are a
  later layer; today only the copy is searchable.

### `ads`
The delivered ad. `creative_id` joins to the creative. Lifecycle:
`first_active_date` / `last_active_date` are recomputed each run from the fact
table (min/max day with delivery), so "how does this ad decay over its life" is
`WHERE date BETWEEN first_active_date AND last_active_date`.

## Facts

### `ad_insights_daily` — attribution-independent delivery + engagement
One row per ad per day. Everything that doesn't depend on how you count a
conversion lives here: `spend`, `impressions`, `reach`, `clicks`,
`inline_link_clicks`, `landing_page_views`, the full **video funnel**
(`video_plays`, `video_3s_views`, `video_p25_views` … `video_p100_views`,
`video_thruplays`), and Meta's three **quality rankings**
(`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`,
text tiers like `ABOVE_AVERAGE`; `NULL` when Meta hasn't rated the ad).
- `frequency` is a ratio — do **not** `SUM` it.
- The video columns are the funnel rungs for Q1. Each is a count of people who
  reached that rung, so drop-off = `rung(n-1) - rung(n)`.

### `ad_conversions_daily` — attribution-dependent outcomes
One row per ad per day **per attribution model per customer type**. This is
where revenue lives (`purchases`, `revenue`, `add_to_cart`, `initiate_checkout`
and their `_value`s). **Always filter `attribution_model` and `customer_type`**
or you will double-count across models.
- `attribution_model` → see `attribution_models`. Foundation writes
  `meta_7d_click_1d_view`. Northbeam / TripleWhale rows arrive later under their
  own keys with no schema change — that is how you "track performance across
  different attribution models".
- `customer_type` → `all | new | returning`. Foundation writes `all`; the
  new-vs-returning split fills in with the external sources.

### `attribution_models`
Reference table. Join or filter by `key`; `source` tells you `meta` vs
`northbeam` vs `triplewhale`.

## Views (read these instead of re-deriving ratios)

- **`v_ad_daily`** — ad × day, joined to creative/campaign/ad set, with `ctr`,
  `cpc`, `cpm`, `hook_rate`, `completion_rate` for single-row reading.
- **`v_ad_roas`** — ad × day spend joined to revenue at the default Meta model /
  all customers, with `roas`, `cpa`, `aov`. For any other model, query
  `ad_conversions_daily` directly.
- **`v_creative_funnel`** — the whole impression → purchase funnel aggregated per
  creative, every rung an absolute count so leaks can be spend-weighted (Q1).

## Not in the foundation (documented so you don't hallucinate them)

There is **no** table yet for AI tags (type/format/angle/hook), transcripts,
visual descriptions, or creator/facial-recognition grouping. If a question
needs those, say so and fall back to the naming-convention approach (see
`sql/examples/q2_creator_performance.sql`). Do not invent columns.
