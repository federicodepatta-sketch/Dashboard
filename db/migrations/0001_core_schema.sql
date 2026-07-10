-- =============================================================================
-- 0001_core_schema.sql — Ad-account AI database, FOUNDATION layer
-- =============================================================================
-- Target: Postgres 15+ / Supabase.
--
-- Design principle (this is the whole point): the CREATIVE is the unit, and the
-- fact tables store ONLY raw additive counts (spend, impressions, clicks,
-- revenue, video plays...). Every ratio (CTR, CPC, ROAS, hold rate) is derived
-- in a VIEW, never stored. This is what keeps aggregation correct: you can SUM
-- clicks and SUM impressions across 40 ads and divide, but you can NEVER average
-- 40 pre-computed CTRs. Storing raw facts is what lets the querying agent write
-- SQL that is right by construction instead of guessing.
--
-- Grain summary:
--   accounts / campaigns / ad_sets / creatives / ads   -> dimensions (one row each)
--   ad_insights_daily      -> (ad_id, date)                              [1 row/ad/day]
--   ad_conversions_daily   -> (ad_id, date, attribution_model, customer_type)
--
-- Attribution-independent metrics (spend, impressions, clicks, the video
-- funnel) live in ad_insights_daily. Conversions/revenue depend on the
-- attribution model AND the new-vs-returning split, so they live in
-- ad_conversions_daily keyed by both. Foundation populates one Meta model and
-- customer_type='all'; Northbeam / TripleWhale rows drop in later with NO schema
-- change.
-- =============================================================================

begin;

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type creative_format as enum ('video', 'image', 'carousel', 'collection', 'dpa', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  -- new  = first-time customer, returning = repeat, all = undifferentiated (Meta default)
  create type customer_type as enum ('all', 'new', 'returning');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- attribution_models — reference table. One row per way of counting revenue.
-- ---------------------------------------------------------------------------
create table if not exists attribution_models (
  key         text primary key,          -- e.g. 'meta_7d_click_1d_view'
  source      text not null,             -- 'meta' | 'northbeam' | 'triplewhale'
  description text
);

insert into attribution_models (key, source, description) values
  ('meta_7d_click_1d_view', 'meta', 'Meta default: 7-day click, 1-day view'),
  ('meta_1d_click',         'meta', 'Meta 1-day click only'),
  ('meta_7d_click',         'meta', 'Meta 7-day click only')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id         text primary key,            -- Meta ad account id, digits only (no "act_")
  name       text,
  currency   text,
  timezone   text,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id             text primary key,
  account_id     text not null references accounts(id) on delete cascade,
  name           text,
  objective      text,
  status         text,
  effective_status text,
  market         text,                    -- derived from name locale token: NL, BE-NL, BE-FR, FR, DE, OTHER
  created_time   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_campaigns_account on campaigns(account_id);
create index if not exists idx_campaigns_market  on campaigns(market);

create table if not exists ad_sets (
  id                text primary key,
  campaign_id       text references campaigns(id) on delete cascade,
  account_id        text not null references accounts(id) on delete cascade,
  name              text,
  optimization_goal text,
  status            text,
  effective_status  text,
  created_time      timestamptz,
  updated_at        timestamptz not null default now()
);
create index if not exists idx_adsets_campaign on ad_sets(campaign_id);

-- The UNIT. A creative is the reusable asset; many ads can share one creative.
create table if not exists creatives (
  id            text primary key,
  account_id    text not null references accounts(id) on delete cascade,
  name          text,
  format        creative_format not null default 'other',
  title         text,                     -- headline copy
  body          text,                     -- primary text / caption
  call_to_action text,
  thumbnail_url text,                     -- preview image
  video_id      text,                     -- Meta video id, if a video creative
  image_hash    text,
  permalink_url text,                     -- the link you can VIEW / embed
  object_type   text,
  created_time  timestamptz,
  updated_at    timestamptz not null default now(),
  -- Searchable text of the ad copy (name + title + body). Visual descriptions
  -- and AI tags are a later layer; this makes copy searchable today.
  search_tsv    tsvector generated always as (
                  to_tsvector('simple',
                    coalesce(name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(body,''))
                ) stored
);
create index if not exists idx_creatives_account on creatives(account_id);
create index if not exists idx_creatives_format  on creatives(format);
create index if not exists idx_creatives_search  on creatives using gin(search_tsv);
create index if not exists idx_creatives_name_trgm on creatives using gin(name gin_trgm_ops);

create table if not exists ads (
  id                text primary key,
  ad_set_id         text references ad_sets(id) on delete set null,
  campaign_id       text references campaigns(id) on delete set null,
  account_id        text not null references accounts(id) on delete cascade,
  creative_id       text references creatives(id) on delete set null,
  name              text,
  status            text,
  effective_status  text,
  created_time      timestamptz,
  first_active_date date,                 -- lifecycle: first day with delivery
  last_active_date  date,                 -- lifecycle: most recent day with delivery
  updated_at        timestamptz not null default now()
);
create index if not exists idx_ads_creative on ads(creative_id);
create index if not exists idx_ads_campaign on ads(campaign_id);
create index if not exists idx_ads_adset    on ads(ad_set_id);

-- ---------------------------------------------------------------------------
-- Fact: ad_insights_daily — attribution-INDEPENDENT delivery + engagement.
-- Grain: one row per ad per day. All columns are additive counts (SUM-safe)
-- except `frequency`, which is a ratio kept only for single-row lookups.
-- ---------------------------------------------------------------------------
create table if not exists ad_insights_daily (
  ad_id                text not null references ads(id) on delete cascade,
  date                 date not null,
  spend                numeric(14,4) not null default 0,
  impressions          bigint not null default 0,
  reach                bigint not null default 0,
  frequency            numeric(10,4),          -- NON-additive, do not SUM
  clicks               bigint not null default 0,   -- all clicks
  inline_link_clicks   bigint not null default 0,   -- link clicks
  outbound_clicks      bigint not null default 0,
  landing_page_views   bigint not null default 0,
  -- Video funnel rungs (each is a count of people reaching that rung)
  video_plays          bigint not null default 0,   -- play starts
  video_3s_views       bigint not null default 0,   -- 3-second (the "hook")
  video_p25_views      bigint not null default 0,
  video_p50_views      bigint not null default 0,
  video_p75_views      bigint not null default 0,
  video_p95_views      bigint not null default 0,
  video_p100_views     bigint not null default 0,   -- completions
  video_thruplays      bigint not null default 0,
  -- Meta's own quality signals (Q3). Text, e.g. ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE_10
  quality_ranking          text,
  engagement_rate_ranking  text,
  conversion_rate_ranking  text,
  updated_at           timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_insights_date on ad_insights_daily(date);

-- ---------------------------------------------------------------------------
-- Fact: ad_conversions_daily — attribution-DEPENDENT outcomes.
-- Grain: one row per ad per day per attribution model per customer type.
-- This is where revenue lives, and where new-vs-returning is split.
-- ---------------------------------------------------------------------------
create table if not exists ad_conversions_daily (
  ad_id                  text not null references ads(id) on delete cascade,
  date                   date not null,
  attribution_model      text not null references attribution_models(key),
  customer_type          customer_type not null default 'all',
  add_to_cart            bigint not null default 0,
  add_to_cart_value      numeric(14,4) not null default 0,
  initiate_checkout      bigint not null default 0,
  initiate_checkout_value numeric(14,4) not null default 0,
  purchases              bigint not null default 0,
  revenue                numeric(14,4) not null default 0,
  updated_at             timestamptz not null default now(),
  primary key (ad_id, date, attribution_model, customer_type)
);
create index if not exists idx_conv_date  on ad_conversions_daily(date);
create index if not exists idx_conv_model on ad_conversions_daily(attribution_model);

commit;
