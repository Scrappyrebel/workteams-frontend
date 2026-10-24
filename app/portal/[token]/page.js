"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  // Temp staffing (Batch 2): request temps + confirm hours, when enabled.
  const [tempReq, setTempReq] = useState({ serviceType: "commercial", cleanersNeeded: 2, hoursRequested: 4, jobDate: "", siteAddress: "", jobDetails: "" });
  const [tempBusy, setTempBusy] = useState(false);
  const [tempDone, setTempDone] = useState(false);
  const [confirming, setConfirming] = useState({});
  const [confirmBusy, setConfirmBusy] = useState(null);
  const [signingAmend, setSigningAmend] = useState(null);
  const [signName, setSignName] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const portalAction = useRef("");
  const [actionError, setActionError] = useState("");
  // A shared synchronous guard prevents double clicks and conflicting writes.
  function beginAction(name) {
    if (portalAction.current || loading || data?.ok !== true) return false;
    portalAction.current = name;
    setActionError("");
    return true;
  }
  function finishAction(name) {
    if (portalAction.current === name) portalAction.current = "";
  }


  useEffect(() => {
    let cancelled = false;
    setLoading(true);setData(null);setContract(null);setContactSent(false);
    setCleanDone(null);setTempDone(false);setActionError("");
    (async () => {
      try {
        const res = await fetch("/api/portal/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await res.json();
        if(cancelled)return;
        setData(result && typeof result.ok === "boolean"
          ? result
          : { ok: false, error: "Could not load this page. Please try again later." });
        if (result && result.ok && result.location_address) {
          setTempReq((t) => ({ ...t, siteAddress: t.siteAddress || result.location_address }));
        }
      } catch {
        if(!cancelled)setData({ ok: false, error: "Could not load this page. Please try again later." });
      }
      if(!cancelled)setLoading(false);
    })();
    fetch(`/api/portal/service?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.contract) setContract(j.contract); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  async function sendContact(e) {
    e.preventDefault();
    if (!contact.body.trim()) { setActionError("Please write your message first."); return; }
    if(!beginAction("contact"))return;
    setContactBusy(true);
    try {
      const res = await fetch("/api/portal/contact", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...contact }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || "Message status could not be confirmed.");
      setContactSent(true);
      setContact({ name: "", subject: "", body: "", category: "general" });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Message status unknown. Ask the business before resending.");
    } finally {
      setContactBusy(false);finishAction("contact");
    }
  }

  async function signAmendment(e) {
    e.preventDefault();
    if (!signingAmend || !signName.trim()) { setActionError("Please type your name to sign."); return; }
    if (portalAction.current || !window.confirm("Sign this amendment? This makes the changes part of your contract.")) return;
    if(!beginAction("sign"))return;
    setSignBusy(true);
    try {
      const res = await fetch("/api/amendments/sign", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign_token: signingAmend.sign_token, name: signName.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || "Signature status could not be confirmed.");
      setSigningAmend(null);
      setSignName("");
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Signature status unknown. Ask the business before signing again.");
    } finally {
      setSignBusy(false);finishAction("sign");
    }
  }

  async function requestClean(e) {
    e.preventDefault();
    if (!cleanReq.date) { setActionError("Pick a date for the extra service."); return; }
    if(!beginAction("service"))return;
    setCleanBusy(true);
    try {
      const res = await fetch("/api/portal/service", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...cleanReq }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || "Service request could not be confirmed.");
      setCleanDone({ kind: cleanReq.kind, price: j.price });
      setCleanReq({ kind: "extra", date: "", notes: "" });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Service status unknown. Check with the business before retrying.");
    } finally { setCleanBusy(false);finishAction("service"); }
  }

  async function requestTemps(e) {
    e.preventDefault();
    if(!beginAction("temp"))return;
    setTempBusy(true);
    try {
      const res = await fetch("/api/portal/temp", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "request", ...tempReq }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || "Temp staffing request could not be confirmed.");
      setTempDone(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Temp request status unknown. Contact the business before resending.");
    } finally { setTempBusy(false);finishAction("temp"); }
  }

  async function confirmHours(e, requestId) {
    e.preventDefault();
    const hours = parseFloat(confirming[requestId]);
    if (!Number.isFinite(hours) || hours < 0) { setActionError("Enter the hours worked."); return; }
    if(!beginAction("hours"))return;
    setConfirmBusy(requestId);
    try {
      const res = await fetch("/api/portal/temp", {
        method: "POST",headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "confirm_hours", requestId, hours }),
      });
      const j = await res.json();
      if (!res.ok || j.ok !== true) throw new Error(j.error || "Hours confirmation could not be verified.");
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Hours confirmation status unknown. Check before retrying.");
    } finally { setConfirmBusy(null);finishAction("hours"); }
  }

  const dueAmendments = Array.isArray(data?.amendments) ? data.amendments.filter(a => a.status === "sent").length : 0;
  const hoursToConfirm = Array.isArray(data?.temp_requests) ? data.temp_requests.filter(r => r.hours_confirmed == null && ["assigned","in_progress","completed"].includes(r.status)).length : 0;
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
            <nav className="panel" aria-label="Client Portal quick access" style={{ padding: 18, margin: "18px 0" }}>
              <h3 style={{margin:"0 0 10px"}}>Quick Access / Acceso rápido</h3>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <a href="#portal-visits">Upcoming visits</a>
                <a href="#portal-inspections">Published quality reports</a>
                <a href="#portal-documents">Documents &amp; agreements</a>
                <a href="#portal-work">Open work</a>
                {contract && <a href="#portal-contract">Contract &amp; scope</a>}
                {data?.amendments?.length > 0 && <a href="#portal-amendments">Contract amendments{dueAmendments>0? ` (${dueAmendments} to sign)` : ""}</a>}
                <a href="#portal-extra">Extra service</a>
                {data.temp_enabled && <a href="#portal-temp">Temp staffing</a>}
                <a href="#portal-contact">Contact us</a>
              </div>
              <p style={{fontSize:"0.85rem",color:"var(--muted)",marginBottom:0}}>Amendments awaiting signature: {dueAmendments} · Temp hours to confirm: {hoursToConfirm}. This secure link is for this location only.</p>
            </nav>
            {actionError && <div role="alert" className="panel" style={{padding:16,border:"1px solid #b3261e",margin:"12px 0"}}><strong>Action not confirmed</strong><p>{actionError}</p><p style={{fontSize:"0.82rem"}}>If your connection stopped after sending, contact the business before submitting the same request again.</p></div>}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-visits" style={{ marginTop: 0 }}>Upcoming visits</h3>
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
              <h3 id="portal-inspections" style={{ marginTop: 0 }}>Published quality reports</h3>
              <p style={{fontSize:"0.82rem",color:"var(--muted)"}}>Only quality summaries approved by the business for this location are visible. Inspection notes, photos, internal checklists and employee identities are private.</p>
              {data.inspections.length === 0 && <p style={{ color: "var(--muted)" }}>No quality reports have been approved for customer sharing yet.</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.inspections.map((x, i) => (
                  <div key={i} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                    <span className="card-kicker">{x.inspection_date} • {"★".repeat(x.score || 0)}</span>
                    {x.customer_summary && <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>{x.customer_summary}</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-work" style={{ marginTop: 0 }}>Open work</h3>
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

            <section className="panel" id="portal-documents" style={{padding:22,margin:"18px 0"}}>
              <h3 style={{marginTop:0}}>Documents &amp; Agreements / Documentos y contratos</h3>
              <p style={{fontSize:"0.9rem",color:"var(--muted)"}}>
                This secure location link includes only approved contract details and amendment statuses.
                It does not provide private downloadable company files or account-wide records.
                Request a copy of your signed agreement using Customer Service.
              </p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                {contract?<a href="#portal-contract">Review location contract / Revisar contrato</a>:<span>No contract summary is currently available.</span>}
                {data?.amendments?.length>0&&<a href="#portal-amendments">Review amendments / Revisar modificaciones</a>}
                <button type="button" disabled={Boolean(portalAction.current)}
                  onClick={()=>{
                    setContactSent(false);
                    setContact(previous=>({...previous,subject:"Request a copy of my signed contract",body:"Please contact me with a secure copy of my approved agreement for this service location.",category:"general"}));
                    document.getElementById("portal-contact")?.scrollIntoView({behavior:"smooth"});
                  }}
                  style={{...pButton,padding:"8px 16px",width:"auto"}}>
                  Request a contract copy / Solicitar copia del contrato
                </button>
              </div>
            </section>

            {contract && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 id="portal-contract" style={{ marginTop: 0 }}>My contract</h3>
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
                <h3 id="portal-amendments" style={{ marginTop: 0 }}>Contract amendments</h3>
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
                      <button disabled={Boolean(portalAction.current)} onClick={() => setSigningAmend(a)} style={{ ...pButton, padding: "10px 20px" }}>
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
                    <button type="button" disabled={signBusy} onClick={() => setSigningAmend(null)} style={{ ...pButton, background: "#fff", color: "var(--text)", border: "1px solid var(--line)" }}>Cancel</button>
                    <button type="submit" disabled={signBusy || Boolean(portalAction.current)} style={pButton}>{signBusy ? "Signing…" : "Sign amendment"}</button>
                  </div>
                </form>
              </div>
            )}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-extra" style={{ marginTop: 0 }}>Request extra service</h3>
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
                  <button type="submit" disabled={cleanBusy || Boolean(portalAction.current)} style={pButton}>{cleanBusy ? "Sending…" : "Request service"}</button>
                </form>
              )}
            </section>

            {data.temp_enabled && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 id="portal-temp" style={{ marginTop: 0 }}>Request temp staff</h3>
                {tempDone ? (
                  <p style={{ color: "#1e8e4d", fontWeight: 700 }}>✅ Request received — we'll confirm your temp staff shortly.</p>
                ) : (
                  <form onSubmit={requestTemps} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Service
                        <select value={tempReq.serviceType} onChange={(e) => setTempReq({ ...tempReq, serviceType: e.target.value })} style={pInput}>
                          <option value="commercial">Office & Commercial</option>
                          <option value="residential">Residential</option>
                          <option value="move_in_out">Move In / Move Out</option>
                          <option value="construction_cleanup">Construction Cleanup</option>
                          <option value="day_janitorial">Day Janitorial</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Temps needed
                        <input type="number" min="1" max="50" required value={tempReq.cleanersNeeded} onChange={(e) => setTempReq({ ...tempReq, cleanersNeeded: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Hours
                        <input type="number" min="1" max="500" step="0.5" required value={tempReq.hoursRequested} onChange={(e) => setTempReq({ ...tempReq, hoursRequested: e.target.value })} style={pInput} />
                      </label>
                      <label style={{ flex: 1, fontSize: "0.85rem", display: "grid", gap: 4 }}>
                        Date needed
                        <input type="date" value={tempReq.jobDate} onChange={(e) => setTempReq({ ...tempReq, jobDate: e.target.value })} style={pInput} />
                      </label>
                    </div>
                    <label style={{ fontSize: "0.85rem", display: "grid", gap: 4 }}>
                      Site address
                      <input required value={tempReq.siteAddress} onChange={(e) => setTempReq({ ...tempReq, siteAddress: e.target.value })} style={pInput} />
                    </label>
                    <textarea placeholder="Job details (optional)" value={tempReq.jobDetails} onChange={(e) => setTempReq({ ...tempReq, jobDetails: e.target.value })} rows={2} style={pInput} />
                    <button type="submit" disabled={tempBusy || Boolean(portalAction.current)} style={pButton}>{tempBusy ? "Sending…" : "Request temp staff"}</button>
                  </form>
                )}
              </section>
            )}

            {data.temp_enabled && data.temp_requests && data.temp_requests.length > 0 && (
              <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
                <h3 style={{ marginTop: 0 }}>My temp requests</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.temp_requests.map((r) => (
                    <div key={r.id} className="portal-card" style={{ minHeight: 0, padding: "12px 16px" }}>
                      <strong>{r.service_type.replace(/_/g, " ")}</strong>
                      <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                        {r.cleaners_needed} temp(s) × {r.hours_requested} hr
                        {r.job_date ? ` · ${r.job_date}` : ""} · {r.status.replace(/_/g, " ")}
                      </div>
                      {r.hours_confirmed != null ? (
                        <p style={{ color: "#1e8e4d", fontWeight: 700, fontSize: "0.9rem", margin: "8px 0 0" }}>
                          ✅ Hours confirmed: {r.hours_confirmed}
                        </p>
                      ) : ["assigned", "in_progress", "completed"].includes(r.status) ? (
                        <form onSubmit={(e) => confirmHours(e, r.id)} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <input
                            type="number" min="0" step="0.25" required
                            placeholder="Hours worked"
                            value={confirming[r.id] || ""}
                            onChange={(e) => setConfirming({ ...confirming, [r.id]: e.target.value })}
                            style={{ ...pInput, flex: 1 }}
                          />
                          <button type="submit" disabled={confirmBusy === r.id || Boolean(portalAction.current)} style={{ ...pButton, padding: "11px 18px" }}>
                            {confirmBusy === r.id ? "Saving…" : "Confirm hours"}
                          </button>
                        </form>
                      ) : (
                        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "8px 0 0" }}>
                          We'll ask you to confirm hours once the job is done.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
              <h3 id="portal-contact" style={{ marginTop: 0 }}>Contact us</h3>
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
                  <button type="submit" disabled={contactBusy || Boolean(portalAction.current)} style={pButton}>{contactBusy ? "Sending…" : "Send message"}</button>
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
