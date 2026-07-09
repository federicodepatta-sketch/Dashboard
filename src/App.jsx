import React, { useState, useCallback, useMemo } from "react";

const C = {
  bg: "#0E1317", panel: "#161D24", panel2: "#1B242D", line: "#28323C", lineSoft: "#202A33",
  txt: "#E7EEF4", mut: "#8998A5", mut2: "#5F6E7A",
  up: "#3FB950", down: "#F16A62", spendUp: "#58A6FF", spendDn: "#C9922E",
  flag: "#E3B341", flagBg: "rgba(227,179,65,0.08)",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
const MARKETS = ["All", "NL", "BE-NL", "BE-FR", "FR", "DE", "OTHER"];
const METRICS = [
  { key: "all", label: "All" }, { key: "spend", label: "Spend" },
  { key: "ctr", label: "CTR" }, { key: "cpc", label: "CPC" },
];

const eur = (n) => "€" + (n ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const eur2 = (n) => "€" + (n ?? 0).toFixed(2);
const pct = (n) => (n ?? 0).toFixed(2) + "%";
const signPct = (n) => (n > 0 ? "+" : "") + n.toFixed(0) + "%";
function pctChange(prior, cur) {
  if (prior === 0 || prior == null) return cur > 0 ? 100 : 0;
  return ((cur - prior) / Math.abs(prior)) * 100;
}
function deltaColor(metric, prior, cur) {
  const d = cur - prior;
  if (d === 0) return C.mut2;
  if (metric === "spend") return d > 0 ? C.spendUp : C.spendDn;
  if (metric === "ctr") return d > 0 ? C.up : C.down;
  if (metric === "cpc") return d > 0 ? C.down : C.up;
  return C.mut;
}
function extractJSON(text) {
  if (!text) return null;
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  return JSON.parse(text.slice(s, e + 1));
}

const SAMPLE = `{"d":{"c":"2026-07-08","p":"2026-07-07"},"acc":{"sp":[4210,4180],"ct":[1.42,1.71],"cc":[0.38,0.34]},"ads":[{"id":"1","nm":"dda_pack_shot_v3","cp":"asc_fr_fr_always_on","mk":"FR","sp":[210,402],"ct":[1.1,1.9],"cc":[0.41,0.29]},{"id":"2","nm":"ugc_pup_bowl","cp":"asc_be_nl_always_on","mk":"BE-NL","sp":[180,120],"ct":[2.1,1.3],"cc":[0.28,0.44]},{"id":"3","nm":"carousel_ingredients","cp":"asc_de_de_always_on","mk":"DE","sp":[90,300],"ct":[0.9,1.0],"cc":[0.52,0.5]}]}`;

export default function App() {
  const [account, setAccount] = useState("2560104667542234");
  const [mode, setMode] = useState("live"); // live | paste
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [raw, setRaw] = useState(null);
  const [data, setData] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const [focus, setFocus] = useState("all");
  const [market, setMarket] = useState("All");
  const [pctT, setPctT] = useState(30);
  const [spendT, setSpendT] = useState(25);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const loadParsed = (parsed) => {
    if (!parsed || !parsed.ads) throw new Error("JSON is missing an `ads` array.");
    setData(parsed);
    setFetchedAt(new Date());
  };

  const fetchLive = useCallback(async () => {
    setLoading(true); setError(null); setRaw(null);
    try {
      const res = await fetch("/api/meta-swing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed (" + res.status + ")");
      setRaw(json.text);
      loadParsed(extractJSON(json.text));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const loadPaste = () => {
    setError(null);
    try {
      loadParsed(extractJSON(pasteText));
    } catch (e) {
      setError("Couldn't parse that JSON: " + e.message);
    }
  };

  const rows = useMemo(() => {
    if (!data?.ads) return [];
    let out = data.ads.map((a) => {
      const m = { spend: { p: a.sp?.[0] ?? 0, c: a.sp?.[1] ?? 0 }, ctr: { p: a.ct?.[0] ?? 0, c: a.ct?.[1] ?? 0 }, cpc: { p: a.cc?.[0] ?? 0, c: a.cc?.[1] ?? 0 } };
      const pc = { spend: pctChange(m.spend.p, m.spend.c), ctr: pctChange(m.ctr.p, m.ctr.c), cpc: pctChange(m.cpc.p, m.cpc.c) };
      const spendDelta = Math.abs(m.spend.c - m.spend.p);
      const focusPct = focus === "all" ? Math.max(Math.abs(pc.spend), Math.abs(pc.ctr), Math.abs(pc.cpc)) : Math.abs(pc[focus]);
      const flagged = Math.abs(pc.spend) >= pctT || Math.abs(pc.ctr) >= pctT || Math.abs(pc.cpc) >= pctT || spendDelta >= spendT;
      return { ...a, m, pc, spendDelta, focusPct, flagged };
    });
    if (market !== "All") out = out.filter((r) => (r.mk || "OTHER") === market);
    if (flaggedOnly) out = out.filter((r) => r.flagged);
    out.sort((a, b) => b.focusPct - a.focusPct);
    return out;
  }, [data, focus, market, pctT, spendT, flaggedOnly]);

  const maxSwing = useMemo(() => Math.max(1, ...rows.map((r) => r.focusPct)), [rows]);
  const flaggedCount = useMemo(() => rows.filter((r) => r.flagged).length, [rows]);
  const acc = data?.acc;
  const accSpendPct = acc ? pctChange(acc.sp[0], acc.sp[1]) : 0;

  return (
    <div style={{ background: C.bg, color: C.txt, fontFamily: SANS, minHeight: "100%" }}>
      <style>{`
        .sm-btn:focus-visible{outline:2px solid ${C.flag};outline-offset:2px}
        input[type=range]{accent-color:${C.flag}}
        @media (prefers-reduced-motion: reduce){*{transition:none!important}}
        .sm-bar{transition:width .35s ease}
      `}</style>
      <div className="mx-auto" style={{ maxWidth: 1120, padding: "22px 20px 40px" }}>
        <div className="flex items-end justify-between flex-wrap gap-3" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16 }}>
          <div>
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: error ? C.down : data ? C.up : C.mut2, display: "inline-block" }} />
              <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Swing Monitor</h1>
            </div>
            <p style={{ color: C.mut, fontSize: 12.5, margin: "5px 0 0" }}>
              Just Russel · Meta ads · ad-level, day-over-day
              {data?.d && <span style={{ fontFamily: MONO, color: C.txt }}>{"  "}· {data.d.p} → {data.d.c}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, padding: 3, gap: 2 }}>
              {["live", "paste"].map((m) => (
                <button key={m} className="sm-btn" onClick={() => setMode(m)}
                  style={{ border: "none", borderRadius: 5, padding: "5px 11px", fontSize: 12, cursor: "pointer", textTransform: "capitalize",
                    background: mode === m ? C.flag : "transparent", color: mode === m ? "#1A1200" : C.mut, fontWeight: mode === m ? 600 : 400 }}>{m}</button>
              ))}
            </div>
            {mode === "live" && (
              <>
                <div className="flex items-center gap-1" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, padding: "4px 8px" }}>
                  <span style={{ color: C.mut2, fontSize: 11 }}>act_</span>
                  <input value={account} onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))}
                    style={{ background: "transparent", border: "none", color: C.txt, fontFamily: MONO, fontSize: 12, width: 118, outline: "none" }} />
                </div>
                <button className="sm-btn" onClick={fetchLive} disabled={loading}
                  style={{ background: loading ? C.panel2 : C.flag, color: loading ? C.mut : "#1A1200", border: "none", borderRadius: 7, padding: "8px 15px", fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
                  {loading ? "Pulling…" : data ? "Refresh" : "Pull data"}
                </button>
              </>
            )}
          </div>
        </div>

        {mode === "paste" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: C.mut2, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Paste ad data JSON</div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={SAMPLE}
              style={{ width: "100%", minHeight: 90, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, color: C.txt, fontFamily: MONO, fontSize: 11.5, padding: 11, outline: "none", boxSizing: "border-box" }} />
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <button className="sm-btn" onClick={loadPaste} style={{ background: C.flag, color: "#1A1200", border: "none", borderRadius: 7, padding: "7px 15px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Load</button>
              <button className="sm-btn" onClick={() => setPasteText(SAMPLE)} style={{ background: C.panel2, color: C.mut, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 15px", fontSize: 12.5, cursor: "pointer" }}>Use sample</button>
            </div>
          </div>
        )}

        {loading && <LoadingState />}
        {error && !loading && <ErrorState msg={error} raw={raw} onRetry={mode === "live" ? fetchLive : loadPaste} />}
        {!data && !loading && !error && mode === "live" && <EmptyState />}

        {data && !loading && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", marginTop: 18 }}>
              <Tile label="Account spend" prior={eur(acc.sp[0])} cur={eur(acc.sp[1])} delta={accSpendPct} color={deltaColor("spend", acc.sp[0], acc.sp[1])} />
              <Tile label="Account CTR" prior={pct(acc.ct[0])} cur={pct(acc.ct[1])} delta={pctChange(acc.ct[0], acc.ct[1])} color={deltaColor("ctr", acc.ct[0], acc.ct[1])} />
              <Tile label="Account CPC" prior={eur2(acc.cc[0])} cur={eur2(acc.cc[1])} delta={pctChange(acc.cc[0], acc.cc[1])} color={deltaColor("cpc", acc.cc[0], acc.cc[1])} />
              <div style={{ background: flaggedCount ? C.flagBg : C.panel, border: `1px solid ${flaggedCount ? C.flag : C.line}`, borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ color: C.mut, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Flagged ads</div>
                <div style={{ fontFamily: MONO, fontSize: 27, fontWeight: 700, color: flaggedCount ? C.flag : C.txt, marginTop: 6 }}>{flaggedCount}</div>
                <div style={{ color: C.mut2, fontSize: 11.5, marginTop: 2 }}>of {rows.length} shown · ≥{pctT}% or ≥{eur(spendT)} Δ</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ marginTop: 20, marginBottom: 12 }}>
              <SegGroup label="Metric" items={METRICS} value={focus} onChange={setFocus} />
              <SegGroup label="Market" items={MARKETS.map((m) => ({ key: m, label: m }))} value={market} onChange={setMarket} />
              <Slider label="% threshold" value={pctT} setValue={setPctT} min={5} max={100} step={5} suffix="%" />
              <Slider label="Min spend Δ" value={spendT} setValue={setSpendT} min={0} max={200} step={5} suffix="€" money />
              <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.mut, cursor: "pointer" }}>
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only
              </label>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
              <div className="flex items-center" style={{ padding: "9px 15px", borderBottom: `1px solid ${C.line}`, color: C.mut2, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                <div style={{ flex: "1 1 auto", minWidth: 160 }}>Ad · campaign</div>
                <div style={{ width: 150, textAlign: "right" }} className="hidden sm:block">Spend</div>
                <div style={{ width: 130, textAlign: "right" }} className="hidden sm:block">CTR</div>
                <div style={{ width: 130, textAlign: "right" }} className="hidden sm:block">CPC</div>
                <div style={{ width: 190, textAlign: "right" }}>Swing · {focus === "all" ? "max" : focus}</div>
              </div>
              {rows.length === 0 && <div style={{ padding: "26px 15px", color: C.mut, fontSize: 13, textAlign: "center" }}>No ads match these filters. Lower the thresholds or clear the market filter.</div>}
              {rows.map((r, i) => <MoverRow key={r.id || i} r={r} focus={focus} maxSwing={maxSwing} />)}
            </div>

            <div style={{ color: C.mut2, fontSize: 11, marginTop: 10, textAlign: "right" }}>
              Ranked by absolute Δ · loaded {fetchedAt?.toLocaleTimeString("en-GB")} · CPC↑ and CTR↓ shown red
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, prior, cur, delta, color }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ color: C.mut, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700 }}>{cur}</span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color }}>{signPct(delta)}</span>
      </div>
      <div style={{ color: C.mut2, fontSize: 11.5, marginTop: 2, fontFamily: MONO }}>from {prior}</div>
    </div>
  );
}
function MetricCell({ metric, m, pc }) {
  const color = deltaColor(metric, m.p, m.c);
  const fmt = metric === "ctr" ? pct : metric === "cpc" ? eur2 : eur;
  return (
    <div style={{ width: metric === "spend" ? 150 : 130, textAlign: "right" }} className="hidden sm:block">
      <div style={{ fontFamily: MONO, fontSize: 13, color: C.txt }}>{fmt(m.c)}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color }}>{signPct(pc)} <span style={{ color: C.mut2 }}>· {fmt(m.p)}</span></div>
    </div>
  );
}
function MoverRow({ r, focus, maxSwing }) {
  const swingMetric = focus === "all"
    ? ["spend", "ctr", "cpc"].reduce((a, k) => (Math.abs(r.pc[k]) > Math.abs(r.pc[a]) ? k : a), "spend")
    : focus;
  const swingPct = r.pc[swingMetric];
  const w = Math.min(100, (Math.abs(swingPct) / maxSwing) * 100);
  const barColor = deltaColor(swingMetric, r.m[swingMetric].p, r.m[swingMetric].c);
  return (
    <div className="flex items-center" style={{ padding: "11px 15px", borderBottom: `1px solid ${C.lineSoft}`, background: r.flagged ? C.flagBg : "transparent", borderLeft: r.flagged ? `2px solid ${C.flag}` : "2px solid transparent" }}>
      <div style={{ flex: "1 1 auto", minWidth: 160, paddingRight: 12 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13, fontWeight: 600, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{r.nm || "(unnamed)"}</span>
          <span style={{ fontSize: 10, color: C.mut, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{r.mk || "OTHER"}</span>
        </div>
        <div style={{ fontSize: 11, color: C.mut2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300, marginTop: 2 }}>{r.cp}</div>
      </div>
      <MetricCell metric="spend" m={r.m.spend} pc={r.pc.spend} />
      <MetricCell metric="ctr" m={r.m.ctr} pc={r.pc.ctr} />
      <MetricCell metric="cpc" m={r.m.cpc} pc={r.pc.cpc} />
      <div style={{ width: 190, paddingLeft: 12 }}>
        <div className="flex items-center gap-2" style={{ justifyContent: "flex-end" }}>
          <div style={{ flex: 1, height: 7, background: C.panel2, borderRadius: 4, overflow: "hidden" }}>
            <div className="sm-bar" style={{ width: w + "%", height: "100%", background: barColor, borderRadius: 4, marginLeft: "auto" }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: barColor, width: 52, textAlign: "right" }}>{signPct(swingPct)}</span>
        </div>
        <div style={{ textAlign: "right", fontSize: 10, color: C.mut2, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{swingMetric}</div>
      </div>
    </div>
  );
}
function SegGroup({ label, items, value, onChange }) {
  return (
    <div>
      <div style={{ color: C.mut2, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div className="flex" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, padding: 3, gap: 2 }}>
        {items.map((it) => (
          <button key={it.key} className="sm-btn" onClick={() => onChange(it.key)}
            style={{ border: "none", borderRadius: 5, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: value === it.key ? 600 : 400, background: value === it.key ? C.flag : "transparent", color: value === it.key ? "#1A1200" : C.mut }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}
function Slider({ label, value, setValue, min, max, step, suffix, money }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
        <span style={{ color: C.mut2, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.flag, fontWeight: 600 }}>{money ? suffix : ""}{value}{!money ? suffix : ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );
}
function LoadingState() {
  return (
    <div style={{ padding: "50px 0", textAlign: "center", color: C.mut }}>
      <div style={{ fontFamily: MONO, fontSize: 13 }}>Querying Meta · building day-over-day breakdown · ranking movers…</div>
      <div style={{ color: C.mut2, fontSize: 11.5, marginTop: 8 }}>Ad-level pulls with tool calls can take 20-40s.</div>
    </div>
  );
}
function EmptyState() {
  return (
    <div style={{ padding: "50px 0", textAlign: "center" }}>
      <div style={{ fontSize: 15, color: C.txt, fontWeight: 600 }}>Nothing pulled yet</div>
      <div style={{ color: C.mut, fontSize: 13, marginTop: 6, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
        Hit <span style={{ color: C.flag, fontWeight: 600 }}>Pull data</span> for a live Meta pull (needs META_MCP_TOKEN set), or switch to <span style={{ color: C.flag, fontWeight: 600 }}>Paste</span> mode to drop in an export.
      </div>
    </div>
  );
}
function ErrorState({ msg, raw, onRetry }) {
  return (
    <div style={{ background: "rgba(241,106,98,0.07)", border: `1px solid ${C.down}`, borderRadius: 10, padding: "16px 18px", marginTop: 18 }}>
      <div style={{ color: C.down, fontSize: 14, fontWeight: 600 }}>Couldn't load the data</div>
      <div style={{ color: C.txt, fontSize: 13, marginTop: 6 }}>{msg}</div>
      {raw && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ color: C.mut2, fontSize: 11.5, cursor: "pointer" }}>Raw response</summary>
          <pre style={{ color: C.mut, fontSize: 11, fontFamily: MONO, whiteSpace: "pre-wrap", marginTop: 6, maxHeight: 160, overflow: "auto" }}>{raw}</pre>
        </details>
      )}
      <button className="sm-btn" onClick={onRetry} style={{ marginTop: 12, background: C.panel2, color: C.txt, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}>Retry</button>
    </div>
  );
}
