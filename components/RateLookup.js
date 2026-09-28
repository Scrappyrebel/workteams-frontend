"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Bold dollar amounts (and optional /sq ft or /hr units) inside result snippets.
function highlightMoney(text) {
  if (!text) return null;
  const re = /(\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:\/|per)\s*(?:sq\.?\s*ft\.?|hour|hr))?)/gi;
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
  );
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function RateLookup({ companyId, defaultArea, frequency, jobType }) {
  const [area, setArea] = useState(defaultArea || "");
  const [touched, setTouched] = useState(false);
  const [results, setResults] = useState([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Follow the suggested area until the user types their own.
  useEffect(() => {
    if (!touched) setArea(defaultArea || "");
  }, [defaultArea, touched]);

  async function lookup() {
    const a = area.trim();
    if (!a || searching) return;
    setSearching(true);
    setError(null);
    setResults([]);
    try {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      const res = await fetch("/api/rate-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ companyId, area: a, frequency: frequency || "", jobType: jobType || "commercial" }),
      });
      const json = await res.json();
      if (json.ok) {
        setResults(json.results || []);
        setSearchedFor(a);
      } else if (json.error === "not_configured") {
        setError("not_configured");
      } else if (json.error === "search_failed") {
        setError("The rate search failed. Check the API key and try again.");
      } else {
        setError("Could not look up rates right now. Try again.");
      }
    } catch {
      setError("Could not look up rates right now. Try again.");
    }
    setSearching(false);
  }

  return (
    <div
      style={{
        border: "1px dashed var(--line)",
        borderRadius: 12,
        padding: "12px 14px",
        marginTop: 10,
        background: "#fbfcfe",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          value={area}
          onChange={(e) => {
            setTouched(true);
            setArea(e.target.value);
          }}
          placeholder="Area (e.g. Chesterfield, MO)"
          aria-label="Area to look up rates for"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            fontSize: "0.95rem",
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={lookup}
          disabled={searching || !area.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "none",
            background: searching || !area.trim() ? "#c9d2e3" : "var(--brand)",
            color: "#fff",
            fontWeight: 800,
            cursor: searching || !area.trim() ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {searching ? "Searching…" : "🔍 Look up rates"}
        </button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
        Searches the web for published cleaning rates in that area — reference only.
      </p>

      {error === "not_configured" && (
        <p style={{ margin: "10px 0 0", fontSize: "0.9rem" }}>
          ⚠️ Rate lookup isn&apos;t set up yet. Add your free Brave Search API key in
          Vercel env vars as <code>YOUCOM_API_KEY</code> to enable it.
        </p>
      )}
      {error && error !== "not_configured" && (
        <p style={{ margin: "10px 0 0", fontSize: "0.9rem", color: "#b3261e" }}>{error}</p>
      )}

      {!searching && !error && results.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
            What the web says about <strong>{searchedFor}</strong>:
          </p>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem" }}
              >
                {r.title || domainOf(r.url)}
              </a>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{domainOf(r.url)}</div>
              {r.snippet && (
                <p style={{ margin: "6px 0 0", fontSize: "0.88rem", lineHeight: 1.45 }}>
                  {highlightMoney(r.snippet)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {!searching && !error && searchedFor && results.length === 0 && (
        <p style={{ margin: "10px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          No published rates found for {searchedFor}. Try a nearby city or the county.
        </p>
      )}
    </div>
  );
}
