"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { getUser } from "../../../../lib/session";
import { chicagoToday } from "../../../../lib/dates";

const STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

function money(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

export default function InvoicesPage() {
  const { company, member, loading } = useCompany();
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    location_id: "",
    client_name: "",
    client_contact: "",
    issue_date: "",
    due_date: "",
    tax_rate: "",
    notes: "",
  });

  const isManager = member && (member.role === "owner" || member.role === "admin");

  useEffect(() => {
    if (company?.timezone) {
      setForm((f) => ({ ...f, issue_date: f.issue_date || chicagoToday(company.timezone) }));
    }
  }, [company?.timezone]);

  async function load() {
    const sb = supabase();
    // Migration 061 creates the invoices table. Until the owner runs it,
    // the query errors — show a calm "not switched on yet" state instead
    // of breaking the page (the app must work before the migration).
    const { data, error: invError } = await sb
      .from("invoices")
      .select("id, invoice_number, location_id, client_name, issue_date, due_date, status, total, amount_paid")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (invError) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setInvoices(data || []);
    const { data: locs } = await sb
      .from("locations")
      .select("id, name, client_name, client_phone")
      .eq("company_id", company.id)
      .order("name");
    setLocations(locs || []);
  }

  useEffect(() => {
    if (!loading && company && member && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, member]);

  function pickLocation(locationId) {
    const loc = locations.find((l) => l.id === locationId);
    setForm((f) => ({
      ...f,
      location_id: locationId,
      client_name: loc ? loc.client_name || loc.name || "" : f.client_name,
      client_contact: loc ? loc.client_phone || "" : f.client_contact,
    }));
  }

  async function createInvoice(e) {
    e.preventDefault();
    setError("");
    if (!form.client_name.trim()) {
      setError("Give the invoice a client name (pick a location or type one).");
      return;
    }
    const tax = form.tax_rate === "" ? 0 : Number(form.tax_rate);
    if (Number.isNaN(tax) || tax < 0 || tax > 100) {
      setError("Tax rate must be between 0 and 100 (percent).");
      return;
    }
    setSaving(true);
    const user = await getUser();
    const sb = supabase();
    const { data, error: insError } = await sb
      .from("invoices")
      .insert({
        company_id: company.id,
        location_id: form.location_id || null,
        client_name: form.client_name.trim(),
        client_contact: form.client_contact.trim(),
        issue_date: form.issue_date || chicagoToday(company?.timezone),
        due_date: form.due_date || null,
        tax_rate: tax,
        notes: form.notes.trim(),
        created_by: user?.id || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insError) {
      setError("Could not create the invoice. " + (insError.message || ""));
      return;
    }
    router.push(`/app/${company.id}/invoices/${data.id}`);
  }

  if (loading || !company) return <p>Loading…</p>;

  if (!isManager) {
    return (
      <div>
        <p className="eyebrow">INVOICES</p>
        <h2 style={{ fontSize: "1.8rem" }}>Invoices</h2>
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Invoices are a financial record — owners and managers only.
          </p>
        </section>
      </div>
    );
  }

  const open = invoices.filter((i) => i.status === "issued");
  const outstanding = open.reduce((s, i) => s + Math.max(0, (Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0);
  const overdue = open.filter((i) => i.due_date && i.due_date < chicagoToday(company?.timezone)).length;

  return (
    <div>
      <p className="eyebrow">INVOICES</p>
      <h2 style={{ fontSize: "1.8rem" }}>Customer invoices</h2>
      <p style={{ color: "var(--muted)" }}>
        Bill a client, record what they pay, and keep the balance straight. Drafts can be
        corrected; once an invoice is issued, fix mistakes by voiding it (with a reason) and
        issuing a new one — issued invoices are never edited or deleted.
      </p>

      {unavailable ? (
        <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
          <p style={{ margin: 0 }}>
            <strong>Invoicing isn't switched on for this database yet.</strong>
          </p>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            A one-time database update (migration 061) creates the invoice tables. Until the
            owner runs it, this page stays empty — nothing else in the app is affected.
          </p>
        </section>
      ) : (
        <>
          <section className="panel" style={{ padding: 20, margin: "16px 0" }}>
            <h3 style={{ marginTop: 0 }}>New invoice</h3>
            <form onSubmit={createInvoice} style={{ display: "grid", gap: 10 }}>
              <label style={labelStyle}>
                Client location (optional)
                <select
                  value={form.location_id}
                  onChange={(e) => pickLocation(e.target.value)}
                  style={input}
                >
                  <option value="">— Type a client below —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.client_name ? ` (${l.client_name})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...labelStyle, flex: "2 1 220px" }}>
                  Client name
                  <input
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    style={input}
                    placeholder="Who is being billed"
                  />
                </label>
                <label style={{ ...labelStyle, flex: "1 1 160px" }}>
                  Client contact (phone or email)
                  <input
                    value={form.client_contact}
                    onChange={(e) => setForm({ ...form, client_contact: e.target.value })}
                    style={input}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...labelStyle, flex: "1 1 140px" }}>
                  Issue date
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    style={input}
                  />
                </label>
                <label style={{ ...labelStyle, flex: "1 1 140px" }}>
                  Due date
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    style={input}
                  />
                </label>
                <label style={{ ...labelStyle, flex: "1 1 120px" }}>
                  Tax rate %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    style={input}
                    placeholder="0"
                  />
                </label>
              </div>
              <label style={labelStyle}>
                Notes
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={input}
                  placeholder="Shown on the invoice record"
                />
              </label>
              {error && <p style={{ color: "#9b2d15", fontWeight: 700, margin: 0 }}>{error}</p>}
              <div>
                <button type="submit" disabled={saving} style={button}>
                  {saving ? "Creating…" : "Create draft invoice"}
                </button>
              </div>
            </form>
          </section>

          {invoices.length > 0 && (
            <p style={{ fontWeight: 800 }}>
              Outstanding: {money(outstanding)}
              {overdue > 0 && (
                <span style={{ color: "#9b2d15" }}> • {overdue} overdue</span>
              )}
            </p>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            {invoices.length === 0 && (
              <p style={{ color: "var(--muted)" }}>No invoices yet. Create the first draft above.</p>
            )}
            {invoices.map((inv) => {
              const balance = Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0));
              const isOverdue =
                inv.status === "issued" && inv.due_date && inv.due_date < chicagoToday(company?.timezone);
              return (
                <Link
                  key={inv.id}
                  href={`/app/${company.id}/invoices/${inv.id}`}
                  className="portal-card"
                  style={{ minHeight: 0, padding: "14px 18px", textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ flex: 1 }}>
                      #{inv.invoice_number} — {inv.client_name || "Unnamed client"}
                    </strong>
                    <span style={badge(inv.status)}>{STATUS_LABELS[inv.status] || inv.status}</span>
                    <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>{money(inv.total)}</span>
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 4 }}>
                    Issued {inv.issue_date || "—"}
                    {inv.due_date && <> • Due {inv.due_date}</>}
                    {inv.status === "issued" && (
                      <> • Balance {money(balance)}{isOverdue && <span style={{ color: "#9b2d15", fontWeight: 700 }}> • Overdue</span>}</>
                    )}
                    {inv.status === "paid" && <> • Paid in full</>}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function badge(status) {
  const colors = {
    draft: { background: "#e8ecf9", color: "#243b96" },
    issued: { background: "#fdf3d7", color: "#7a5b00" },
    paid: { background: "#e2f4e5", color: "#1c6b32" },
    void: { background: "#f6e3de", color: "#9b2d15" },
  };
  return {
    ...(colors[status] || colors.draft),
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: "0.8rem",
    fontWeight: 800,
  };
}

const labelStyle = { fontSize: "0.9rem", fontWeight: 700, display: "block" };

const input = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  marginTop: 6,
};

const button = {
  padding: "11px 22px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
