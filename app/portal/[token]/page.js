"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatTime12h } from "../../../lib/dates";

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
  const [contract, setContract] = useState(null);
  const [contact, setContact] = useState({ name: "", subject: "", body: "", category: "general" });
  const [contactSent, setContactSent] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [cleanReq, setCleanReq] = useState({ kind: "extra", date: "", notes: "" });
  const [cleanBusy, setCleanBusy] = useState(false);
  const [cleanDone, setCleanDone] = useState(null);
  const [signingAmend, setSigningAmend] = useState(null);
  const [signName, setSignName] = useState("");
  const [signBusy, setSignBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portal/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await res.json();
        setData(result && typeof result.ok === "boolean"
          ? result
          : { ok: false, error: "Could not load this page. Please try again later." });
      } catch {
        setData({ ok: false, error: "Could not load this page. Please try again later." });
      }
      setLoading(false);
    })();
    fetch(`/api/portal/service?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (j.contract) setContract(j.contract); })
      .catch(() => {});
  }, [token]);

  async function sendContact(e) {
    e.preventDefault();
    if (!contact.body.trim()) { alert("Please write your message first."); return; }
    setContactBusy(true);
    try {
      const res = await fetch("/api/portal/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...contact }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not send");
      setContactSent(true);
      setContact({ name: "", subject: "", body: "", category: "general" });
    } catch (err) {
      alert(err.message);
    }
    setContactBusy(false);
  }

  async function signAmendment(e) {
    e.preventDefault();
    if (!signingAmend || !signName.trim()) { alert("Please type your name to sign."); return; }
    if (!window.confirm("Sign this amendment? This makes the changes part of your contract.")) return;
    setSignBusy(true);
    try {
      const res = await fetch("/api/amendments/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign_token: signingAmend.sign_token, name: signName.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not sign");
      alert("Amendment signed! Thank you.");
      setSigningAmend(null);
      setSignName("");
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
    setSignBusy(false);
  }

  async function requestClean(e) {
    e.preventDefault();
    if (!cleanReq.date) { alert("Pick a date for the extra service."); return; }
    setCleanBusy(true);
    try {
      const res = await fetch("/api/portal/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...cleanReq }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not submit");
      setCleanDone({ kind: cleanReq.kind, price: j.price });
      setCleanReq({ kind: "extra", date: "", notes: "" });
    } catch (err) {
      alert(err.message);
    }
    setCleanBusy(false);
  }

  const money = (n) => (n == null ? "priced on request" : "$" + Number(n).toFixed(2));

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
                      {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}
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
              Questions about your service? Use the contact form below or reach out directly.
            </p>

            {contract && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 style={{ marginTop: 0 }}>My contract</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  Effective {contract.start_date}
                  {contract.end_date ? ` through ${contract.end_date}` : ""}
                  {contract.visits_per_week ? ` • ${contract.visits_per_week} visit${contract.visits_per_week > 1 ? "s" : ""}/week` : ""}
                  {contract.price_per_visit != null ? ` • $${Number(contract.price_per_visit).toFixed(2)}/visit` : ""}
                </p>
                {Array.isArray(contract.scope_of_work) && contract.scope_of_work.length > 0 && (
                  <>
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>Scope of work</p>
                    <ul style={{ marginTop: 0, paddingLeft: 20 }}>
                      {contract.scope_of_work.map((s, i) => (
                        <li key={i} style={{ fontSize: "0.9rem" }}>{typeof s === "string" ? s : s.task}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Rate increases {contract.yearly_increase_pct ?? 3}% yearly. Extra clean: {money(contract.extra_clean_price)} •
                  Heavy clean: {money(contract.heavy_clean_price)}.
                </p>
                {contract.terms_text && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.9rem", color: "var(--brand-deep)" }}>
                      View full contract terms
                    </summary>
                    <div style={{ whiteSpace: "pre-line", fontSize: "0.85rem", lineHeight: 1.6, marginTop: 10, padding: 14, background: "var(--bg-soft)", borderRadius: 8 }}>
                      {contract.terms_text}
                    </div>
                  </details>
                )}
              </section>
            )}

            {data?.amendments?.length > 0 && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 style={{ marginTop: 0 }}>Contract amendments</h3>
                {data.amendments.map((a) => (
                  <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <p style={{ fontWeight: 800, margin: "0 0 6px" }}>{a.title}</p>
                    <p style={{ fontSize: "0.9rem", whiteSpace: "pre-line", margin: "0 0 8px" }}>{a.description}</p>
                    {a.changes && Object.keys(a.changes).length > 0 && (
                      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 8px" }}>
                        {a.changes.price_per_visit ? `New price: $${Number(a.changes.price_per_visit).toFixed(2)}/visit. ` : ""}
                        {a.changes.visits_per_week ? `New schedule: ${a.changes.visits_per_week}/week. ` : ""}
                        {a.changes.end_date ? `New end date: ${a.changes.end_date}.` : ""}
                      </p>
                    )}
                    {a.status === "signed" ? (
                      <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
                        ✅ Signed by {a.signed_name} on {new Date(a.signed_at).toLocaleDateString()}
                      </p>
                    ) : a.status === "sent" ? (
                      <button onClick={() => setSigningAmend(a)} style={{ ...pButton, padding: "10px 20px" }}>
                        Review & sign
                      </button>
                    ) : null}
                  </div>
                ))}
              </section>
            )}

            {signingAmend && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
                <form onSubmit={signAmendment} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", display: "grid", gap: 12 }}>
                  <h3 style={{ margin: 0 }}>Sign amendment</h3>
                  <p style={{ fontWeight: 800, margin: 0 }}>{signingAmend.title}</p>
                  <p style={{ fontSize: "0.9rem", whiteSpace: "pre-line", margin: 0 }}>{signingAmend.description}</p>
                  <input required placeholder="Type your full name to sign" value={signName} onChange={(e) => setSignName(e.target.value)} style={pInput} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setSigningAmend(null)} style={{ ...pButton, background: "#fff", color: "var(--text)", border: "1px solid var(--line)" }}>Cancel</button>
                    <button type="submit" disabled={signBusy} style={pButton}>{signBusy ? "Signing…" : "Sign amendment"}</button>
                  </div>
                </form>
              </div>
            )}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 style={{ marginTop: 0 }}>Request extra service</h3>
              {cleanDone ? (
                <p style={{ color: "#1e8e4d", fontWeight: 700 }}>
                  ✅ Request received — we'll confirm your {cleanDone.kind} clean shortly
                  {cleanDone.price != null ? ` (${money(cleanDone.price)})` : ""}.
                </p>
              ) : (
                <form onSubmit={requestClean} style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Service
                      <select value={cleanReq.kind} onChange={(e) => setCleanReq({ ...cleanReq, kind: e.target.value })} style={pInput}>
                        <option value="extra">Extra clean{contract ? ` — ${money(contract.extra_clean_price)}` : ""}</option>
                        <option value="heavy">Heavy clean{contract ? ` — ${money(contract.heavy_clean_price)}` : ""}</option>
                      </select>
                    </label>
                    <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Preferred date
                      <input type="date" required value={cleanReq.date} onChange={(e) => setCleanReq({ ...cleanReq, date: e.target.value })} style={pInput} />
                    </label>
                  </div>
                  <textarea placeholder="Notes (optional)" value={cleanReq.notes} onChange={(e) => setCleanReq({ ...cleanReq, notes: e.target.value })} rows={2} style={pInput} />
                  <button type="submit" disabled={cleanBusy} style={pButton}>{cleanBusy ? "Sending…" : "Request service"}</button>
                </form>
              )}
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 style={{ marginTop: 0 }}>Contact us</h3>
              {contactSent ? (
                <p style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ Message sent — we'll get back to you soon.</p>
              ) : (
                <form onSubmit={sendContact} style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      ["general", "💬 General question"],
                      ["service_problem", "⚠️ Problem with service"],
                      ["callback_request", "📞 Please call me"],
                    ].map(([val, label]) => (
                      <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", fontWeight: contact.category === val ? 800 : 400, cursor: "pointer", padding: "8px 12px", borderRadius: 999, border: contact.category === val ? "2px solid var(--brand)" : "1px solid var(--line)", background: contact.category === val ? "var(--bg-soft)" : "transparent" }}>
                        <input type="radio" name="category" value={val} checked={contact.category === val} onChange={() => setContact({ ...contact, category: val })} style={{ display: "none" }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Your name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} style={{ ...pInput, flex: 1 }} />
                    <input placeholder="Subject" value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} style={{ ...pInput, flex: 1 }} />
                  </div>
                  <textarea placeholder={contact.category === "service_problem" ? "Tell us what went wrong — we'll make it right." : contact.category === "callback_request" ? "Best number and time to reach you…" : "How can we help?"} required value={contact.body} onChange={(e) => setContact({ ...contact, body: e.target.value })} rows={3} style={pInput} />
                  <button type="submit" disabled={contactBusy} style={pButton}>{contactBusy ? "Sending…" : "Send message"}</button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

const pInput = { padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", width: "100%" };
const pButton = { padding: "12px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
