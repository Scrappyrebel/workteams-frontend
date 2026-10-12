"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchCompanyState, guidanceLine } from "../lib/rate-guidance";

// Small reference line shown under per-hour / per-sq-ft inputs in the bid flow.
// Guidance only: it never fills or overwrites the input next to it.
export default function RateGuidance({ companyId, kind, style }) {
  const [line, setLine] = useState("");
  const [showNationalHint, setShowNationalHint] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const state = await fetchCompanyState(supabase(), companyId);
      if (!live) return;
      setLine(guidanceLine(state, kind));
      setShowNationalHint(!state);
    })();
    return () => {
      live = false;
    };
  }, [companyId, kind]);

  if (!line) return null;
  return (
    <div
      style={{
        margin: "6px 0 0",
        fontSize: "0.85rem",
        background: "#f4f6fb",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "8px 12px",
        ...style,
      }}
    >
      <span>{line}</span>
      {showNationalHint && (
        <span style={{ color: "var(--muted)" }}>
          {" "}Set your state in Settings for state-adjusted ranges.
        </span>
      )}
    </div>
  );
}
