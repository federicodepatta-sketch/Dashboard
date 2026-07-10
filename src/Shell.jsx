import React, { useState } from "react";
import { C, SANS } from "./theme.js";
import App from "./App.jsx";
import Intelligence from "./Intelligence.jsx";

const TABS = [
  { key: "intel", label: "Ad Intelligence" },
  { key: "swing", label: "Swing Monitor" },
];

export default function Shell() {
  const [tab, setTab] = useState("intel");
  return (
    <div style={{ background: C.bg, minHeight: "100%", fontFamily: SANS }}>
      <nav className="flex items-center gap-1" style={{
        maxWidth: 1120, margin: "0 auto", padding: "10px 20px 0",
      }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? C.txt : C.mut, padding: "8px 12px",
              borderBottom: `2px solid ${tab === t.key ? C.flag : "transparent"}`,
            }}>{t.label}</button>
        ))}
      </nav>
      {tab === "intel" ? <Intelligence /> : <App />}
    </div>
  );
}
