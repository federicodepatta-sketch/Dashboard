# Ad-account AI database — schema overview

The foundation layer of the ad-account brain: a clean Postgres/Supabase schema
built around the **ad creative as the unit**, populated by a **daily Meta Graph
API pull**, and queried by Claude writing **real SQL** against documented tables
instead of parsing exports.

```
accounts
  └─ campaigns ─ ad_sets ─ ads ──────────────┐
                            │  creative_id    │
                            ▼                 ▼
                        creatives      ad_insights_daily   (ad × day, delivery + video funnel + Meta rankings)
                                             │
                                             └ ad_conversions_daily
                                                 (ad × day × attribution_model × customer_type — revenue lives here)

attribution_models  ── reference for ad_conversions_daily.attribution_model
```

Read next:
- **`tables.md`** — how each table works, the grain, and the "never average a
  ratio" rule. This is the file the querying agent must read first.
- **`querying.md`** — the filter → SQL → analyze loop and the accuracy rules.
- **`../../sql/examples/`** — worked SQL for the three example questions.
- **`../../db/migrations/`** — the DDL. Apply in order.

## Requirements coverage (foundation)

| Requirement | Where |
| --- | --- |
| Answer quickly & accurately | Raw-count facts + ratios-in-views + indexes; SQL isolates rows |
| Live data, every morning | `api/cron/daily-meta-pull.js` + `vercel.json` cron `0 6 * * *` |
| Track across attribution models | `ad_conversions_daily.attribution_model` + `attribution_models` |
| Engagement metrics per creative | `ad_insights_daily` video funnel + `v_creative_funnel` |
| Creative as viewable/embeddable link | `creatives.permalink_url`, `thumbnail_url` |
| Searchable creative descriptions | `creatives.search_tsv` (ad copy today; visual desc later) |
| Spend/revenue new vs returning | `ad_conversions_daily.customer_type` (populated by external sources later) |

**Deferred to later layers** (per the article's phased plan): AI tags
(type/format/angle/hook), transcripts, visual descriptions, facial-recognition
creator grouping, and Northbeam/TripleWhale imports. The schema has explicit
seams for all of these (`attribution_model`, `customer_type`, and documented
extension points) so they drop in without a rewrite.
