// =============================================================================
// meta-daily-pull.mjs — Daily Meta Graph API -> Supabase pull.
//
// Populates the schema in db/migrations. Idempotent: every write is an UPSERT
// keyed on the fact-table primary keys, so re-running a day is safe.
//
// Usage:
//   node pipeline/meta-daily-pull.mjs                # yesterday (account tz-agnostic UTC)
//   node pipeline/meta-daily-pull.mjs --date 2026-07-09
//   node pipeline/meta-daily-pull.mjs --since 2026-06-01 --until 2026-06-30   # backfill
//
// Env (never commit real values — see .env.example):
//   META_ACCESS_TOKEN        long-lived Graph API token
//   META_AD_ACCOUNT_ID       digits only, e.g. 2560104667542234
//   SUPABASE_URL             https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (server-side only)
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import {
  GRAPH_VERSION, INSIGHT_FIELDS, ATTRIBUTION_WINDOWS,
  mapInsightRow, marketFromName, creativeFormat,
} from "./meta-fields.mjs";

const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------- args & env ----------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--date") a.date = argv[++i];
    else if (k === "--since") a.since = argv[++i];
    else if (k === "--until") a.until = argv[++i];
  }
  return a;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Resolve the date window from args, defaulting to "yesterday".
export function resolveWindow(args, todayIso) {
  const today = new Date(todayIso + "T00:00:00Z");
  if (args.since && args.until) return { since: args.since, until: args.until };
  if (args.date) return { since: args.date, until: args.date };
  const y = new Date(today);
  y.setUTCDate(y.getUTCDate() - 1);
  const d = isoDate(y);
  return { since: d, until: d };
}

// ---------- Graph API paging ----------
async function graphGetAll(path, params, token) {
  const rows = [];
  let url = `${BASE}/${path}?${new URLSearchParams({ ...params, access_token: token, limit: "200" })}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Graph API ${path}: ${json?.error?.message || res.status}`);
    }
    if (Array.isArray(json.data)) rows.push(...json.data);
    url = json.paging?.next || null;
  }
  return rows;
}

// ---------- upsert helpers ----------
async function upsert(sb, table, rows, onConflict) {
  if (!rows.length) return 0;
  // chunk to keep request bodies sane
  const size = 500;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await sb.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
  return rows.length;
}

// ---------- dimension sync ----------
async function syncDimensions(sb, acct, token) {
  const actId = `act_${acct}`;

  // account (minimal; enrich name/currency/timezone if you fetch /act_{id})
  await upsert(sb, "accounts", [{ id: acct }], "id");

  const campaigns = await graphGetAll(`${actId}/campaigns`,
    { fields: "id,name,objective,status,effective_status" }, token);
  await upsert(sb, "campaigns", campaigns.map((c) => ({
    id: c.id, account_id: acct, name: c.name, objective: c.objective,
    status: c.status, effective_status: c.effective_status,
    market: marketFromName(c.name),
  })), "id");

  const adsets = await graphGetAll(`${actId}/adsets`,
    { fields: "id,name,optimization_goal,status,effective_status,campaign_id" }, token);
  await upsert(sb, "ad_sets", adsets.map((s) => ({
    id: s.id, campaign_id: s.campaign_id, account_id: acct, name: s.name,
    optimization_goal: s.optimization_goal, status: s.status,
    effective_status: s.effective_status,
  })), "id");

  const ads = await graphGetAll(`${actId}/ads`, {
    fields: "id,name,status,effective_status,adset_id,campaign_id,created_time," +
      "creative{id,name,title,body,object_type,thumbnail_url,image_hash,video_id," +
      "call_to_action_type,effective_object_story_id,object_story_spec}",
  }, token);

  const creativesById = new Map();
  const adRows = ads.map((ad) => {
    const cr = ad.creative;
    if (cr && !creativesById.has(cr.id)) {
      const spec = cr.object_story_spec || {};
      const linkData = spec.link_data || spec.video_data || {};
      creativesById.set(cr.id, {
        id: cr.id, account_id: acct, name: cr.name, format: creativeFormat(cr),
        title: cr.title || linkData.name || null,
        body: cr.body || linkData.message || null,
        call_to_action: cr.call_to_action_type || linkData.call_to_action?.type || null,
        thumbnail_url: cr.thumbnail_url || null,
        video_id: cr.video_id || null,
        image_hash: cr.image_hash || null,
        permalink_url: cr.effective_object_story_id
          ? `https://www.facebook.com/${cr.effective_object_story_id}` : null,
        object_type: cr.object_type || null,
      });
    }
    return {
      id: ad.id, ad_set_id: ad.adset_id, campaign_id: ad.campaign_id,
      account_id: acct, creative_id: cr?.id || null, name: ad.name,
      status: ad.status, effective_status: ad.effective_status,
      created_time: ad.created_time || null,
    };
  });

  await upsert(sb, "creatives", [...creativesById.values()], "id");
  await upsert(sb, "ads", adRows, "id");
  return { campaigns: campaigns.length, adsets: adsets.length, ads: adRows.length, creatives: creativesById.size };
}

// ---------- insights ----------
async function syncInsights(sb, acct, token, since, until) {
  const rows = await graphGetAll(`act_${acct}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: JSON.stringify(ATTRIBUTION_WINDOWS),
    fields: INSIGHT_FIELDS,
  }, token);

  const insights = [];
  const conversions = [];
  for (const row of rows) {
    const date = row.date_start; // time_increment=1 sets date_start=date_stop
    const { insight, conversion } = mapInsightRow(row, date);
    insights.push(insight);
    conversions.push(conversion);
  }

  await upsert(sb, "ad_insights_daily", insights, "ad_id,date");
  await upsert(sb, "ad_conversions_daily", conversions, "ad_id,date,attribution_model,customer_type");
  return { insightRows: insights.length };
}

// ---------- entry point ----------
export async function run({ args = {}, todayIso, env = process.env, log = console.log } = {}) {
  const token = env.META_ACCESS_TOKEN;
  const acct = (env.META_AD_ACCOUNT_ID || "").replace(/[^0-9]/g, "");
  const sbUrl = env.SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !token && "META_ACCESS_TOKEN", !acct && "META_AD_ACCOUNT_ID",
    !sbUrl && "SUPABASE_URL", !sbKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

  const { since, until } = resolveWindow(args, todayIso || isoDate(new Date()));
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

  log(`[pull] account act_${acct}  window ${since}..${until}`);
  const dims = await syncDimensions(sb, acct, token);
  log(`[pull] dims: ${JSON.stringify(dims)}`);
  const ins = await syncInsights(sb, acct, token, since, until);
  log(`[pull] insights rows: ${ins.insightRows}`);

  // Recompute ad lifecycle boundaries server-side (correct after any backfill).
  const { error: lcErr } = await sb.rpc("refresh_ad_lifecycle");
  if (lcErr) log(`[pull] warn: refresh_ad_lifecycle failed (${lcErr.message}) — apply db/migrations/0003_functions.sql`);
  log(`[pull] done`);
  return { since, until, ...dims, ...ins };
}

// Allow `node pipeline/meta-daily-pull.mjs ...` as a CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  run({ args: parseArgs(process.argv.slice(2)), todayIso: isoDate(new Date()) })
    .then((r) => { console.log("OK", r); process.exit(0); })
    .catch((e) => { console.error("FAILED", e.message); process.exit(1); });
}
