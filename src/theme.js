// Shared dark palette + formatters. Matches the Swing Monitor's established
// colors so the two surfaces read as one product. Roles map to the dataviz
// method: surface = panel, primary/secondary ink = txt/mut, status colors are
// reserved (never used as a series hue), sequential = one blue hue.

export const C = {
  bg: "#0E1317", panel: "#161D24", panel2: "#1B242D",
  line: "#28323C", lineSoft: "#202A33",
  txt: "#E7EEF4", mut: "#8998A5", mut2: "#5F6E7A",
  // sequential (single hue, magnitude)
  seq: "#58A6FF", seqDim: "#2C4A66",
  // status — reserved, paired with a label, never a series
  good: "#3FB950", warning: "#E3B341", serious: "#E38C41", critical: "#F16A62",
  flag: "#E3B341", flagBg: "rgba(227,179,65,0.08)",
};

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

export const eur = (n) => "€" + Math.round(n ?? 0).toLocaleString("en-GB");
export const num = (n) => Math.round(n ?? 0).toLocaleString("en-GB");
export const x2 = (n) => (n == null ? "—" : n.toFixed(2) + "×");
export const pct1 = (n) => (n == null ? "—" : n.toFixed(1) + "%");
