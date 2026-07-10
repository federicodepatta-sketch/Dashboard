// Vercel Cron entry: runs the daily Meta -> Supabase pull.
// Scheduled in vercel.json ("0 6 * * *" = 06:00 UTC daily). Vercel authenticates
// cron requests with a Bearer CRON_SECRET header; we verify it before running.

import { run } from "../../pipeline/meta-daily-pull.mjs";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret && auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const result = await run({ args: {}, todayIso });
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
