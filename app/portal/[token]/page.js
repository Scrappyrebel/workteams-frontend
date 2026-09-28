"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// Public client portal — no login. Data comes only from the
// get_portal_data() security-definer function, which returns
// whitelisted fields: location info, upcoming visits, recent
// inspection scores, and open work orders. No financial data,
// no employee details.
export default function PortalPage() {
  const params = useParams();
  const token = params.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: result, error } = await supabase().rpc("get_portal_data", { tok: token });
      setLoading(false);
      if (error) {
        setData({ ok: false, error: "Could not load this page. Please try again later." });
      } else {
        setData(result);
      }
    })();
  }, [token]);

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.96)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="site-shell" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <span className="brand-mark" style={{ width: 40, height: 40, flexBasis: 40, borderRadius: 12, fontSize: "0.95rem" }}>
              WT
            </span>
            <strong>WorkTeams</strong>
          </Link>
          <span style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--muted)" }}>Client portal</span>
        </div>
      </header>
      <main className="site-shell" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 640 }}>
        {loading && <p>Loading…</p>}
        {!loading && data && !data.ok && (
          <section className="panel" style={{ padding: 30 }}>
            <h2 style={{ marginTop: 0 }}>Link unavailable</h2>
            <p style={{ color: "var(--muted)" }}>{data.error}</p>
          </section>
        )}
        {!loading && data && data.ok && (
          <div>
            <p className="eyebrow">SERVICE UPDATES</p>
            <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{data.location_name}</h2>
            {data.location_address && <p style={{ color: "var(--muted)" }}>{data.location_address}</p>}
            {data.client_name && <p style={{ color: "var(--muted)" }}>Prepared for {data.client_name}</p>}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 style={{ marginTop: 0 }}>Upcoming visits</h3>
              {data.upcoming.length === 0 && <p style={{ color: "var(--muted)" }}>No visits scheduled in the next two weeks.</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.upcoming.map((s, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <strong>{s.shift_date}</strong>
                    <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                      {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 style={{ marginTop: 0 }}>Recent quality scores</h3>
              {data.inspections.length === 0 && <p style={{ color: "var(--muted)" }}>No inspections recorded yet.</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.inspections.map((x, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <span className="card-kicker">{x.inspection_date} • {"★".repeat(x.score || 0)}</span>
                    {x.notes && <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{x.notes}</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 style={{ marginTop: 0 }}>Open work</h3>
              {data.work_orders.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing open right now.</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.work_orders.map((w, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <span className="card-kicker">
                      {w.status === "in_progress" ? "In progress" : "Open"}
                      {w.priority && w.priority !== "normal" ? ` • ${w.priority}` : ""}
                    </span>
                    <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{w.title}</p>
                    {w.description && <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{w.description}</p>}
                    {w.due_date && <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>Due {w.due_date}</p>}
                  </div>
                ))}
              </div>
            </section>

            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Questions about your service? Contact your cleaning provider directly.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
