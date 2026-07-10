// Vercel serverless function: POST /api/analysis
// Runs the repeat-query analyses (db/migrations/0004) against Supabase using the
// service-role key, server-side. The browser never sees the key.
//
// Body: { q: "<name>", since?, until?, format?, minSpend?, limit? }
//   q ∈ overview | funnel | creators | metaQuality | metaTiers | topCreatives

import { createClient } from "@supabase/supabase-js";

const MAP = {
  overview:     (b) => ["analysis_overview",            { p_since: b.since ?? null, p_until: b.until ?? null }],
  funnel:       (b) => ["analysis_funnel",              { p_format: b.format ?? "video", p_since: b.since ?? null, p_until: b.until ?? null }],
  creators:     (b) => ["analysis_creators",            { p_since: b.since ?? null, p_until: b.until ?? null, p_min_spend: b.minSpend ?? 500 }],
  metaQuality:  (b) => ["analysis_meta_quality",        { p_since: b.since ?? null, p_until: b.until ?? null }],
  metaTiers:    (b) => ["analysis_meta_quality_tiers",  { p_since: b.since ?? null, p_until: b.until ?? null }],
  topCreatives: (b) => ["analysis_top_creatives",       { p_format: b.format ?? null, p_since: b.since ?? null, p_until: b.until ?? null, p_min_spend: b.minSpend ?? 200, p_limit: b.limit ?? 10 }],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(400).json({ error: "Supabase is not configured on this deployment (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }

  const body = req.body || {};
  const entry = MAP[body.q];
  if (!entry) {
    res.status(400).json({ error: `Unknown analysis "${body.q}". Expected one of: ${Object.keys(MAP).join(", ")}.` });
    return;
  }

  try {
    const [fn, params] = entry(body);
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw new Error(error.message);
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message || "Analysis query failed" });
  }
}
