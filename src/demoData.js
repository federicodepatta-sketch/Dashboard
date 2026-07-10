// Bundled demo dataset so the Ad Intelligence dashboard renders end-to-end
// without a live Supabase (mirrors the Swing Monitor's "sample" fallback).
// Shapes match exactly what /api/analysis returns from the 0004 RPCs.

export const DEMO = {
  overview: [{
    spend: 84000, revenue: 268800, roas: 3.2, purchases: 3100,
    active_ads: 142, active_creatives: 63,
  }],
  funnel: [
    { step: 1,  rung: "Impressions",  reached: 1200000, spend: 84000 },
    { step: 2,  rung: "3s hook",      reached: 540000,  spend: 84000 },
    { step: 3,  rung: "25%",          reached: 300000,  spend: 84000 },
    { step: 4,  rung: "50%",          reached: 180000,  spend: 84000 },
    { step: 5,  rung: "75%",          reached: 96000,   spend: 84000 },
    { step: 6,  rung: "95%",          reached: 60000,   spend: 84000 },
    { step: 7,  rung: "100%",         reached: 48000,   spend: 84000 },
    { step: 8,  rung: "Link click",   reached: 42000,   spend: 84000 },
    { step: 9,  rung: "Landing page", reached: 34000,   spend: 84000 },
    { step: 10, rung: "Add to cart",  reached: 9800,    spend: 84000 },
    { step: 11, rung: "Checkout",     reached: 5400,    spend: 84000 },
    { step: 12, rung: "Purchase",     reached: 3100,    spend: 84000 },
  ],
  creators: [
    { creator: "bram",   active_days: 30, spend: 14200, revenue: 61000, roas: 4.30, purchases: 720, cpa: 19.7, ctr_pct: 2.1 },
    { creator: "lotte",  active_days: 28, spend: 9800,  revenue: 35300, roas: 3.60, purchases: 410, cpa: 23.9, ctr_pct: 1.8 },
    { creator: "sanne",  active_days: 30, spend: 22100, revenue: 70700, roas: 3.20, purchases: 810, cpa: 27.3, ctr_pct: 1.5 },
    { creator: "thomas", active_days: 22, spend: 6400,  revenue: 17300, roas: 2.70, purchases: 190, cpa: 33.7, ctr_pct: 1.3 },
    { creator: "emma",   active_days: 26, spend: 11200, revenue: 26900, roas: 2.40, purchases: 300, cpa: 37.3, ctr_pct: 1.1 },
    { creator: "daan",   active_days: 19, spend: 5100,  revenue: 9700,  roas: 1.90, purchases: 110, cpa: 46.4, ctr_pct: 0.9 },
  ],
  metaQuality: [{ corr: 0.08, ads: 96, verdict: "NO SIGNAL" }],
  metaTiers: [
    { quality_ranking: "ABOVE_AVERAGE",    ads: 22, roas: 3.4 },
    { quality_ranking: "BELOW_AVERAGE_10", ads: 14, roas: 3.3 },
    { quality_ranking: "AVERAGE",          ads: 48, roas: 3.1 },
    { quality_ranking: "UNRATED",          ads: 12, roas: 2.9 },
  ],
  topCreatives: [
    { creative_id: "c1", name: "ugc_bram_grainfree_hook_v4", format: "video", permalink_url: "https://www.facebook.com/",
      title: "No more itchy paws", body: "Bram switched to grain-free and the scratching stopped in two weeks.",
      spend: 4200, revenue: 20160, roas: 4.8, purchases: 240 },
    { creative_id: "c2", name: "dda_packshot_variety_v2", format: "image", permalink_url: "https://www.facebook.com/",
      title: "Every flavour, one box", body: "The variety pack your dog actually finishes.",
      spend: 3600, revenue: 14760, roas: 4.1, purchases: 175 },
    { creative_id: "c3", name: "carousel_ingredients_transparency", format: "carousel", permalink_url: "https://www.facebook.com/",
      title: "What's really in it", body: "Swipe through every ingredient — nothing to hide.",
      spend: 5100, revenue: 19890, roas: 3.9, purchases: 210 },
    { creative_id: "c4", name: "ugc_lotte_routine_v3", format: "video", permalink_url: "https://www.facebook.com/",
      title: "Our morning routine", body: "Lotte's honest take on switching foods.",
      spend: 2900, revenue: 10440, roas: 3.6, purchases: 128 },
    { creative_id: "c5", name: "dda_offer_firstbox_50", format: "image", permalink_url: "https://www.facebook.com/",
      title: "50% off your first box", body: "Try it risk-free this week.",
      spend: 6200, revenue: 21080, roas: 3.4, purchases: 265 },
  ],
};
