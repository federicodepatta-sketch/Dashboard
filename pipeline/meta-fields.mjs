// =============================================================================
// meta-fields.mjs — Graph API field lists + action-array mapping helpers.
// Pure functions, no I/O, so they're easy to unit-test.
// =============================================================================

export const GRAPH_VERSION = "v21.0";

// Ad-level insight fields we pull daily (time_increment=1).
export const INSIGHT_FIELDS = [
  "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
  "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
  "outbound_clicks",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "actions", "action_values",
  "video_play_actions",
  "video_3_sec_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p95_watched_actions",
  "video_p100_watched_actions", "video_thruplay_watched_actions",
].join(",");

// The Meta default attribution model this pull writes into.
export const DEFAULT_ATTRIBUTION_MODEL = "meta_7d_click_1d_view";
export const ATTRIBUTION_WINDOWS = ["7d_click", "1d_view"];

// action_type buckets. Meta emits both bare and offsite pixel variants; sum any.
const ACTION_MAP = {
  landing_page_views: ["landing_page_view"],
  add_to_cart: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"],
  initiate_checkout: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"],
  purchases: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
};

// Sum the `value` of every action entry whose action_type is in `types`.
// For purchases/ATC we prefer the omni/pixel variant but avoid double counting
// by taking the max across the synonym set rather than the sum.
function sumActions(actions, types) {
  if (!Array.isArray(actions)) return 0;
  let best = 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) best = Math.max(best, Number(hit.value) || 0);
  }
  return best;
}

function firstValue(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  return Number(list[0].value) || 0;
}

// Map one raw insight row -> { insight, conversion } shaped for the DB tables.
export function mapInsightRow(row, date) {
  const insight = {
    ad_id: row.ad_id,
    date,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: Number(row.reach) || 0,
    frequency: row.frequency != null ? Number(row.frequency) : null,
    clicks: Number(row.clicks) || 0,
    inline_link_clicks: Number(row.inline_link_clicks) || 0,
    outbound_clicks: firstValue(row.outbound_clicks),
    landing_page_views: sumActions(row.actions, ACTION_MAP.landing_page_views),
    video_plays: firstValue(row.video_play_actions),
    video_3s_views: firstValue(row.video_3_sec_watched_actions),
    video_p25_views: firstValue(row.video_p25_watched_actions),
    video_p50_views: firstValue(row.video_p50_watched_actions),
    video_p75_views: firstValue(row.video_p75_watched_actions),
    video_p95_views: firstValue(row.video_p95_watched_actions),
    video_p100_views: firstValue(row.video_p100_watched_actions),
    video_thruplays: firstValue(row.video_thruplay_watched_actions),
    quality_ranking: normRanking(row.quality_ranking),
    engagement_rate_ranking: normRanking(row.engagement_rate_ranking),
    conversion_rate_ranking: normRanking(row.conversion_rate_ranking),
  };

  const conversion = {
    ad_id: row.ad_id,
    date,
    attribution_model: DEFAULT_ATTRIBUTION_MODEL,
    customer_type: "all",
    add_to_cart: sumActions(row.actions, ACTION_MAP.add_to_cart),
    add_to_cart_value: sumActions(row.action_values, ACTION_MAP.add_to_cart),
    initiate_checkout: sumActions(row.actions, ACTION_MAP.initiate_checkout),
    initiate_checkout_value: sumActions(row.action_values, ACTION_MAP.initiate_checkout),
    purchases: sumActions(row.actions, ACTION_MAP.purchases),
    revenue: sumActions(row.action_values, ACTION_MAP.purchases),
  };

  return { insight, conversion };
}

// Meta returns "UNKNOWN" when an ad hasn't cleared the volume threshold; store null.
function normRanking(v) {
  if (!v || v === "UNKNOWN") return null;
  return v;
}

// Derive a market from a campaign name's locale token. Mirrors the existing
// Swing Monitor logic: _nl_nl_ -> NL, _be_nl_ -> BE-NL, etc.
export function marketFromName(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("_be_nl_")) return "BE-NL";
  if (n.includes("_be_fr_")) return "BE-FR";
  if (n.includes("_nl_nl_") || n.includes("_nl_")) return "NL";
  if (n.includes("_fr_fr_") || n.includes("_fr_")) return "FR";
  if (n.includes("_de_de_") || n.includes("_de_")) return "DE";
  return "OTHER";
}

// Best-effort creative format from a Graph creative object.
export function creativeFormat(creative) {
  if (!creative) return "other";
  if (creative.video_id) return "video";
  const t = (creative.object_type || "").toUpperCase();
  if (t === "VIDEO") return "video";
  if (t === "PHOTO" || t === "IMAGE") return "image";
  const spec = creative.object_story_spec || {};
  if (spec.link_data?.child_attachments?.length) return "carousel";
  if (spec.template_data) return "dpa";
  return "other";
}
