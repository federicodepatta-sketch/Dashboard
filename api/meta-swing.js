// Vercel serverless function: /api/meta-swing
// Keeps ANTHROPIC_API_KEY server-side. Attaches the Meta MCP token for the live pull.

const PROMPT = `You are a data fetcher for a Meta Ads swing dashboard. Use the Meta ads MCP tools to pull AD-LEVEL insights for Just Russel ad account act_ACCOUNT_ID.

Steps:
1. Determine the two most recent COMPLETE days: current = most recent full day, prior = the day before it.
2. Pull ad-level insights with a daily breakdown (time_increment:1) for that 2-day range. For each ad get: ad id, ad name, campaign name, spend, ctr (percent), cpc.
3. Keep only ads with spend >= 5 in at least one of the two days. Then keep the 40 ads with the LARGEST absolute day-over-day change across spend, ctr or cpc.
4. Infer market from the campaign name locale token (_nl_nl_ -> NL, _be_nl_ -> BE-NL, _be_fr_ -> BE-FR, _fr_fr_ -> FR, _de_de_ -> DE, else OTHER).

Return ONLY minified JSON, no prose, no code fences. Arrays are [prior, current]. Round to 2 decimals. Use 0 for missing:
{"d":{"c":"YYYY-MM-DD","p":"YYYY-MM-DD"},"acc":{"sp":[p,c],"ct":[p,c],"cc":[p,c]},"ads":[{"id":"","nm":"","cp":"","mk":"","sp":[p,c],"ct":[p,c],"cc":[p,c]}]}`;

const MCP_NAME = "meta-just-russel";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mcpToken = process.env.META_MCP_TOKEN;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in the environment." });
    return;
  }
  if (!mcpToken) {
    res.status(400).json({
      error:
        "META_MCP_TOKEN is not set, so the live Meta pull is unavailable on this deployment. Use paste mode in the UI, or add a Meta MCP token in your Vercel env vars.",
    });
    return;
  }

  const account = (req.body?.account || "").toString().replace(/[^0-9]/g, "") || "2560104667542234";

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-11-20",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: PROMPT.replace("ACCOUNT_ID", account) }],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.facebook.com/ads",
            name: MCP_NAME,
            authorization_token: mcpToken,
          },
        ],
        tools: [{ type: "mcp_toolset", mcp_server_name: MCP_NAME }],
      }),
    });

    const json = await anthropicRes.json();
    if (!anthropicRes.ok) {
      res.status(anthropicRes.status).json({ error: json?.error?.message || "Anthropic API error" });
      return;
    }

    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message || "Proxy request failed" });
  }
}
