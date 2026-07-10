import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, MONO, SANS, eur, num, x2, pct1 } from "./theme.js";
import { DEMO } from "./demoData.js";

// --- data plumbing -----------------------------------------------------------
const RANGES = [
  { key: 7, label: "7d" }, { key: 30, label: "30d" }, { key: 90, label: "90d" },
];
const FORMATS = [
  { key: "all", label: "All" }, { key: "video", label: "Video" }, { key: "image", label: "Image" },
];

const iso = (d) => d.toISOString().slice(0, 10);
function rangeDates(days) {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  return { since: iso(since), until: iso(until) };
}

async function fetchAnalysis(q, params) {
  const res = await fetch("/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, ...params }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Request failed (" + res.status + ")");
  }
  const { data } = await res.json();
  return data;
}

export default function Intelligence() {
  const [days, setDays] = useState(30);
  const [fmt, setFmt] = useState("video");
  const [data, setData] = useState(DEMO);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { since, until } = rangeDates(days);
    const fmtParam = fmt === "all" ? null : fmt;
    const jobs = [
      ["overview", { since, until }],
      ["funnel", { since, until, format: fmt === "all" ? "video" : fmt }],
      ["creators", { since, until }],
      ["metaQuality", { since, until }],
      ["metaTiers", { since, until }],
      ["topCreatives", { since, until, format: fmtParam, limit: 5 }],
    ];
    const results = await Promise.allSettled(jobs.map(([q, p]) => fetchAnalysis(q, p)));
    const next = {};
    let liveCount = 0;
    results.forEach((r, i) => {
      const q = jobs[i][0];
      if (r.status === "fulfilled" && Array.isArray(r.value)) { next[q] = r.value; liveCount++; }
      else next[q] = DEMO[q];
    });
    setData(next);
    setLive(liveCount > 0);
    setLoading(false);
  }, [days, fmt]);

  useEffect(() => { load(); }, [load]);

  const ov = data.overview?.[0] || {};
  const mq = data.metaQuality?.[0] || {};

  return (
    <div style={{ background: C.bg, color: C.txt, fontFamily: SANS, minHeight: "100%" }}>
      <style>{`
        .ai-bar{transition:width .35s ease}
        .ai-link:hover{color:${C.seq}}
        @media (prefers-reduced-motion: reduce){*{transition:none!important}}
      `}</style>
      <div className="mx-auto" style={{ maxWidth: 1120, padding: "22px 20px 48px" }}>

        {/* header */}
        <div className="flex items-end justify-between flex-wrap gap-3" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Ad Intelligence</h1>
            <p style={{ color: C.mut, fontSize: 12.5, margin: "5px 0 0" }}>
              Just Russel · creative-level · SQL-backed · {live ? "live" : "demo data"}
              <span style={{ color: live ? C.good : C.warning }}>{"  "}●</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Seg label="Range" items={RANGES} value={days} onChange={setDays} />
            <Seg label="Format" items={FORMATS} value={fmt} onChange={setFmt} />
          </div>
        </div>

        {!live && (
          <div style={{ background: C.flagBg, border: `1px solid ${C.warning}`, borderRadius: 8, padding: "9px 13px", marginTop: 14, fontSize: 12.5, color: C.txt }}>
            Showing bundled demo data — <code style={{ fontFamily: MONO, color: C.warning }}>/api/analysis</code> isn't reachable.
            Apply the migrations and set <code style={{ fontFamily: MONO }}>SUPABASE_URL</code> / <code style={{ fontFamily: MONO }}>SUPABASE_SERVICE_ROLE_KEY</code> to go live.
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 18 }}>
          <Tile label="Spend" value={eur(ov.spend)} />
          <Tile label="Revenue" value={eur(ov.revenue)} sub="Meta 7d-click / 1d-view" />
          <Tile label="ROAS" value={x2(ov.roas)} accent={ov.roas >= 1 ? C.good : C.critical} />
          <Tile label="Purchases" value={num(ov.purchases)} />
          <Tile label="Creatives" value={num(ov.active_creatives)} sub={`${num(ov.active_ads)} ads`} />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", marginTop: 16 }}>
          <FunnelPanel rows={data.funnel || []} fmt={fmt} />
          <CreatorPanel rows={data.creators || []} />
          <MetaQualityPanel mq={mq} tiers={data.metaTiers || []} />
          <TopCreativesPanel rows={data.topCreatives || []} />
        </div>

        <p style={{ color: C.mut2, fontSize: 11, marginTop: 16 }}>
          Every panel is one SQL function (see <code style={{ fontFamily: MONO }}>db/migrations/0004</code>) — the same numbers you get asking Claude in plain language.
          {loading && <span style={{ color: C.mut }}> · refreshing…</span>}
        </p>
      </div>
    </div>
  );
}

// --- Q1 funnel ---------------------------------------------------------------
function FunnelPanel({ rows, fmt }) {
  const enriched = useMemo(() => {
    if (!rows.length) return { steps: [], leakIdx: -1 };
    const top = rows[0].reached || 1;
    let leakIdx = -1, worst = -1;
    const steps = rows.map((r, i) => {
      const prev = i === 0 ? null : rows[i - 1].reached;
      const dropPct = prev ? 100 * (1 - r.reached / (prev || 1)) : 0;
      const lost = prev ? prev - r.reached : 0;
      if (i > 0 && dropPct > worst) { worst = dropPct; leakIdx = i; }
      return { ...r, widthPct: (r.reached / top) * 100, dropPct, lost, prev };
    });
    return { steps, leakIdx };
  }, [rows]);

  return (
    <Panel title="Where's the leak?" hint={`impression → purchase · ${fmt === "all" ? "video" : fmt} · weighted by spend`}>
      <div>
        {enriched.steps.map((s, i) => {
          const isLeak = i === enriched.leakIdx;
          return (
            <div key={s.step} style={{ marginBottom: 7 }}
              title={`${s.rung}: ${num(s.reached)} reached${s.prev ? ` · −${num(s.lost)} (${pct1(s.dropPct)}) from ${enriched.steps[i - 1].rung}` : ""}`}>
              <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: isLeak ? C.critical : C.txt, fontWeight: isLeak ? 700 : 500 }}>
                  {s.rung}{isLeak && <span style={{ fontSize: 10, color: C.critical, marginLeft: 6 }}>▲ biggest leak</span>}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.mut, fontVariantNumeric: "tabular-nums" }}>
                  {num(s.reached)}{i > 0 && <span style={{ color: isLeak ? C.critical : C.mut2 }}>{"  "}−{pct1(s.dropPct)}</span>}
                </span>
              </div>
              <div style={{ height: 14, background: C.panel2, borderRadius: 4 }}>
                <div className="ai-bar" style={{ width: Math.max(1.5, s.widthPct) + "%", height: "100%", background: isLeak ? C.critical : C.seq, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// --- Q2 creators -------------------------------------------------------------
function CreatorPanel({ rows }) {
  const max = Math.max(0.01, ...rows.map((r) => r.roas || 0));
  return (
    <Panel title="Which creator drives results?" hint="ROAS by creator · naming-convention grouping">
      {rows.length === 0 && <Empty />}
      {rows.map((r) => (
        <div key={r.creator} style={{ marginBottom: 10 }}
          title={`${r.creator}: ${eur(r.spend)} spend → ${eur(r.revenue)} · ${r.purchases} purchases · CPA ${eur(r.cpa)} · CTR ${pct1(r.ctr_pct)}`}>
          <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 12.5, color: C.txt, textTransform: "capitalize" }}>{r.creator}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.seq, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{x2(r.roas)}</span>
          </div>
          <div style={{ height: 12, background: C.panel2, borderRadius: 4 }}>
            <div className="ai-bar" style={{ width: ((r.roas || 0) / max) * 100 + "%", height: "100%", background: C.seq, borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 10.5, color: C.mut2, marginTop: 2, fontFamily: MONO }}>{eur(r.spend)} → {eur(r.revenue)}</div>
        </div>
      ))}
    </Panel>
  );
}

// --- Q3 meta quality ---------------------------------------------------------
const VERDICT_COLOR = {
  PREDICTS: C.good, "NO SIGNAL": C.mut, INVERTED: C.critical, "INSUFFICIENT DATA": C.mut2,
};
function MetaQualityPanel({ mq, tiers }) {
  const max = Math.max(0.01, ...tiers.map((t) => t.roas || 0));
  const vc = VERDICT_COLOR[mq.verdict] || C.mut;
  return (
    <Panel title="Trust Meta's quality rankings?" hint="Meta ranking vs actual ROAS">
      <div className="flex items-baseline gap-3" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: vc, letterSpacing: "-0.01em" }}>{mq.verdict || "—"}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.mut }}>r = {mq.corr ?? "—"} · n = {mq.ads ?? "—"}</span>
      </div>
      {tiers.map((t) => (
        <div key={t.quality_ranking} style={{ marginBottom: 8 }} title={`${t.quality_ranking}: ROAS ${x2(t.roas)} across ${t.ads} ads`}>
          <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 11.5, color: C.txt }}>{t.quality_ranking.replace(/_/g, " ").toLowerCase()}</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.mut, fontVariantNumeric: "tabular-nums" }}>{x2(t.roas)} · {t.ads} ads</span>
          </div>
          <div style={{ height: 11, background: C.panel2, borderRadius: 4 }}>
            <div className="ai-bar" style={{ width: ((t.roas || 0) / max) * 100 + "%", height: "100%", background: C.seq, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

// --- top creatives -----------------------------------------------------------
function TopCreativesPanel({ rows }) {
  return (
    <Panel title="Send me the three best" hint="top creatives by ROAS · viewable links">
      {rows.length === 0 && <Empty />}
      {rows.map((r, i) => (
        <div key={r.creative_id} className="flex gap-3" style={{ padding: "9px 0", borderTop: i ? `1px solid ${C.lineSoft}` : "none" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.mut2, width: 16, flexShrink: 0 }}>{i + 1}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || r.name}</span>
              <span style={{ fontSize: 9.5, color: C.mut, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{r.format}</span>
            </div>
            <div style={{ fontSize: 11, color: C.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{r.body || r.name}</div>
            <div style={{ fontSize: 10.5, color: C.mut, marginTop: 3, fontFamily: MONO }}>
              {eur(r.spend)} → {eur(r.revenue)} · {r.purchases} purch
              {r.permalink_url && <> · <a className="ai-link" href={r.permalink_url} target="_blank" rel="noreferrer" style={{ color: C.mut, textDecoration: "none" }}>View ↗</a></>}
            </div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 13, color: C.seq, fontWeight: 700, flexShrink: 0 }}>{x2(r.roas)}</span>
        </div>
      ))}
    </Panel>
  );
}

// --- shared bits -------------------------------------------------------------
function Panel({ title, hint, children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "15px 16px" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.txt }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: C.mut2, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
function Tile({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ color: C.mut, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, marginTop: 6, color: accent || C.txt }}>{value}</div>
      {sub && <div style={{ color: C.mut2, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Seg({ label, items, value, onChange }) {
  return (
    <div>
      <div style={{ color: C.mut2, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div className="flex" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, padding: 3, gap: 2 }}>
        {items.map((it) => (
          <button key={it.key} onClick={() => onChange(it.key)}
            style={{ border: "none", borderRadius: 5, padding: "5px 10px", fontSize: 12, cursor: "pointer",
              fontWeight: value === it.key ? 600 : 400, background: value === it.key ? C.flag : "transparent",
              color: value === it.key ? "#1A1200" : C.mut }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}
function Empty() {
  return <div style={{ padding: "18px 0", color: C.mut2, fontSize: 12.5, textAlign: "center" }}>No rows for these filters.</div>;
}
