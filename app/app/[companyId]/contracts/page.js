"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";
import { buildContractText } from "../../../../lib/contracts";

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const emptyForm = {
  bid_id: "", client_name: "", client_email: "", location_id: "",
  scope: "", start_date: "", end_date: "", visits_per_week: "",
  price_per_visit: "", extra_clean_price: "", heavy_clean_price: "",
  yearly_increase_pct: "3",
};

export default function ContractsPage() {
  const { company, member, loading } = useCompany();
  const [contracts, setContracts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [bids, setBids] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "portal");

  async function load() {
    const sb = supabase();
    const { data: cs } = await sb.from("contracts")
      .select("*, locations(name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setContracts(cs || []);
    const { data: locs } = await sb.from("locations").select("id, name").eq("company_id", company.id).order("name");
    setLocations(locs || []);
    const { data: bd } = await sb.from("bids").select("id, title, client_name").eq("company_id", company.id).eq("status", "accepted").order("created_at", { ascending: false });
    setBids(bd || []);
  }

  useEffect(() => {
    if (!loading && company && isManager && allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  function formToContract() {
    const loc = locations.find((l) => l.id === form.location_id);
    const scope = form.scope.split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      companyName: company.name,
      clientName: form.client_name.trim(),
      locationName: loc ? loc.name : "",
      scopeOfWork: scope,
      startDate: form.start_date,
      endDate: form.end_date || null,
      visitsPerWeek: form.visits_per_week ? parseInt(form.visits_per_week, 10) : null,
      pricePerVisit: form.price_per_visit ? parseFloat(form.price_per_visit) : null,
      yearlyIncreasePct: form.yearly_increase_pct ? parseFloat(form.yearly_increase_pct) : 3,
      extraCleanPrice: form.extra_clean_price ? parseFloat(form.extra_clean_price) : null,
      heavyCleanPrice: form.heavy_clean_price ? parseFloat(form.heavy_clean_price) : null,
    };
  }

  async function saveContract(e) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.start_date) {
      alert("Client name and start date are required.");
      return;
    }
    setBusy(true);
    try {
      const c = formToContract();
      const terms = buildContractText(c);
      const scope = c.scopeOfWork.map((t) => ({ task: t }));
      const { data, error } = await supabase().from("contracts").insert({
        company_id: company.id,
        location_id: form.location_id || null,
        bid_id: form.bid_id || null,
        client_name: c.clientName,
        client_email: form.client_email.trim() || null,
        scope_of_work: scope,
        start_date: c.startDate,
        end_date: c.endDate,
        visits_per_week: c.visitsPerWeek,
        price_per_visit: c.pricePerVisit,
        yearly_increase_pct: c.yearlyIncreasePct,
        extra_clean_price: c.extraCleanPrice,
        heavy_clean_price: c.heavyCleanPrice,
        terms_text: terms,
        status: "draft",
        sign_token: makeToken(),
      }).select().single();
      if (error) throw error;
      setForm(emptyForm);
      setShowForm(false);
      setPreview(null);
      await load();
      alert("Contract created. Copy the signing link from the list and send it to the client.");
    } catch (err) {
      alert("Could not save contract: " + err.message);
    }
    setBusy(false);
  }

  function signingLink(token) {
    return `${window.location.origin}/contract/${token}`;
  }

  async function copyLink(token) {
    try {
      await navigator.clipboard.writeText(signingLink(token));
      alert("Signing link copied — text or email it to the client.");
    } catch {
      prompt("Copy the signing link:", signingLink(token));
    }
  }

  async function markSent(id) {
    const { error } = await supabase().from("contracts").update({ status: "sent" }).eq("id", id);
    if (!error) load();
  }

  async function deleteContract(id) {
    if (!window.confirm("Delete this contract?")) return;
    const { error } = await supabase().from("contracts").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!isManager) return <p>Only owners and admins can manage contracts.</p>;
  if (!allowed) return <p>Contracts are a Pro feature. <a href={`/app/${company.id}/plans`}>See plans →</a></p>;

  const statusColor = (s) =>
    s === "signed" ? "#1e8e4d" : s === "sent" || s === "viewed" ? "#b7791f" : "var(--muted)";

  return (
    <div>
      <p className="eyebrow">CONTRACTS</p>
      <h2 style={{ fontSize: "1.8rem" }}>Client contracts</h2>
      <p style={{ color: "var(--muted)" }}>
        Generate a contract from a bid or from scratch. The client signs online — yearly increase,
        holiday, and severe-weather clauses are included automatically.
      </p>

      <button onClick={() => { setShowForm(!showForm); setPreview(null); }} style={button}>
        {showForm ? "Cancel" : "+ New contract"}
      </button>

      {showForm && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <form onSubmit={saveContract} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
            {bids.length > 0 && (
              <select value={form.bid_id} onChange={(e) => setForm({ ...form, bid_id: e.target.value })} style={input}>
                <option value="">From accepted bid… (optional)</option>
                {bids.map((b) => <option key={b.id} value={b.id}>{b.title} — {b.client_name}</option>)}
              </select>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input required placeholder="Client name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} style={{ ...input, flex: 1 }} />
              <input placeholder="Client email" type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} style={{ ...input, flex: 1 }} />
            </div>
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} style={input}>
              <option value="">Service location…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <textarea placeholder={"Scope of work — one task per line\nExample:\nClean all restrooms\nVacuum offices\nEmpty trash"} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} rows={5} style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={lbl}>Start <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={input} /></label>
              <label style={lbl}>End <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={input} /></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={lbl}>Visits/week <input type="number" min="1" max="7" value={form.visits_per_week} onChange={(e) => setForm({ ...form, visits_per_week: e.target.value })} style={input} /></label>
              <label style={lbl}>Price/visit ($) <input type="number" min="0" step="0.01" value={form.price_per_visit} onChange={(e) => setForm({ ...form, price_per_visit: e.target.value })} style={input} /></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={lbl}>Extra clean ($) <input type="number" min="0" step="0.01" value={form.extra_clean_price} onChange={(e) => setForm({ ...form, extra_clean_price: e.target.value })} style={input} /></label>
              <label style={lbl}>Heavy clean ($) <input type="number" min="0" step="0.01" value={form.heavy_clean_price} onChange={(e) => setForm({ ...form, heavy_clean_price: e.target.value })} style={input} /></label>
              <label style={lbl}>Yearly increase % <input type="number" min="0" step="0.1" value={form.yearly_increase_pct} onChange={(e) => setForm({ ...form, yearly_increase_pct: e.target.value })} style={input} /></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setPreview(buildContractText(formToContract()))} style={secondaryButton}>Preview terms</button>
              <button type="submit" disabled={busy} style={button}>{busy ? "Saving…" : "Create contract"}</button>
            </div>
          </form>
          {preview && (
            <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f8", borderRadius: 12, padding: 16, marginTop: 14, fontSize: "0.85rem" }}>{preview}</pre>
          )}
        </section>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {contracts.length === 0 && <p style={{ color: "var(--muted)" }}>No contracts yet.</p>}
        {contracts.map((c) => (
          <div key={c.id} className="portal-card" style={{ minHeight: 0, padding: "16px 20px" }}>
            <span className="card-kicker">
              <strong style={{ color: statusColor(c.status) }}>{c.status.toUpperCase()}</strong>
              {" • "}{c.client_name}{c.locations?.name ? ` • ${c.locations.name}` : ""}
              {" • "}{c.start_date}{c.end_date ? ` → ${c.end_date}` : ""}
            </span>
            {c.status === "signed" && (
              <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
                Signed by {c.signed_name} on {new Date(c.signed_at).toLocaleDateString()}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {c.sign_token && c.status !== "signed" && (
                <>
                  <button onClick={() => copyLink(c.sign_token)} style={smallButton}>Copy signing link</button>
                  {c.status === "draft" && <button onClick={() => markSent(c.id)} style={smallButton}>Mark as sent</button>}
                </>
              )}
              <button onClick={() => deleteContract(c.id)} style={smallDanger}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const input = { padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", fontSize: "1rem", width: "100%" };
const lbl = { flex: 1, fontSize: "0.85rem", color: "var(--muted)", display: "grid", gap: 4 };
const button = { padding: "12px 22px", borderRadius: 999, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondaryButton = { padding: "12px 22px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontWeight: 700, cursor: "pointer" };
const smallButton = { border: "1px solid var(--line)", background: "#fff", borderRadius: 999, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" };
const smallDanger = { border: "1px solid #f0c9c4", background: "#fff", color: "#b3261e", borderRadius: 999, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" };
