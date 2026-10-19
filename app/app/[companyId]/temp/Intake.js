"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

const ENGAGEMENT_LABELS = { temp: "Temp", temp_to_hire: "Temp-to-hire", direct_hire: "Direct hire" };
const OFFER_STATUS = { offered: "Offered", accepted: "Accepted", declined: "Declined", expired: "Expired", cancelled: "Cancelled" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getToken() {
  const { data: session } = await supabase().auth.getSession();
  return session?.session?.access_token || "";
}

const input = { width: "100%", padding: 8, marginTop: 4, fontSize: 14 };
const label = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 2 };

// ---------------- Client profiles (POINT 1) ----------------

const EMPTY_CLIENT = {
  staffing_type: "cleaning",
  business_name: "",
  contact_first: "",
  contact_last: "",
  phone: "",
  email: "",
  billing_address: "",
  invoice_method: "email",
  payment_terms: "net 15",
  site_address: "",
  site_city: "",
  site_zip: "",
  facility_type: "",
  supplies_provider: "us",
  access_info: "",
  parking_info: "",
  on_site_contact_name: "",
  on_site_contact_phone: "",
  task_checklist: [],
  off_limits: "",
  dress_code: "",
  hazards: "",
  ppe_required: "",
  min_experience: "",
  bg_check_required: false,
  drug_test_required: false,
  do_not_return: [],
  notes: "",
};

export function ClientsTab({ companyId, staffingTypes, typeLabels }) {
  const [profiles, setProfiles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [msg, setMsg] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [dnrInput, setDnrInput] = useState("");

  async function load() {
    const token = await getToken();
    const r = await fetch(`/api/temp/clients?companyId=${companyId}`, { headers: authHeaders(token) });
    const j = await r.json();
    if (j.profiles) setProfiles(j.profiles);
  }
  useEffect(() => { load(); }, [companyId]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function startNew() {
    setForm({ ...EMPTY_CLIENT, staffing_type: staffingTypes[0] || "cleaning" });
    setEditing("new");
  }
  function startEdit(p) {
    setForm({ ...EMPTY_CLIENT, ...p, task_checklist: p.task_checklist || [], do_not_return: p.do_not_return || [] });
    setEditing(p.id);
  }

  async function save(e) {
    e.preventDefault();
    setMsg("");
    const token = await getToken();
    const method = editing === "new" ? "POST" : "PUT";
    const r = await fetch("/api/temp/clients", {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ companyId, id: editing === "new" ? undefined : editing, ...form }),
    });
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || "Save failed."); return; }
    setEditing(null);
    setMsg("Client profile saved.");
    load();
  }

  async function remove(id) {
    if (!window.confirm("Delete this client profile?")) return;
    const token = await getToken();
    const r = await fetch(`/api/temp/clients?id=${id}&companyId=${companyId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    const j = await r.json();
    setMsg(j.ok ? "Deleted." : j.error || "Delete failed.");
    if (j.ok) load();
  }

  function addListItem(key, value, setValue) {
    const v = value.trim();
    if (!v) return;
    setForm((f) => ({ ...f, [key]: [...(f[key] || []), v] }));
    setValue("");
  }

  if (editing) {
    return (
      <section className="panel" style={{ padding: 24, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>{editing === "new" ? "New client profile" : "Edit client profile"}</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Asked once per client. Every future request pre-fills from this profile.
        </p>
        <form onSubmit={save} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Staffing lane
              <select value={form.staffing_type} onChange={set("staffing_type")} style={input}>
                {staffingTypes.map((t) => (
                  <option key={t} value={t}>{typeLabels[t] || t}</option>
                ))}
              </select>
            </label>
            <label style={label}>Business name
              <input value={form.business_name} onChange={set("business_name")} style={input} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Contact first name
              <input value={form.contact_first} onChange={set("contact_first")} style={input} />
            </label>
            <label style={label}>Contact last name
              <input value={form.contact_last} onChange={set("contact_last")} style={input} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Phone
              <input value={form.phone} onChange={set("phone")} style={input} />
            </label>
            <label style={label}>Email
              <input type="email" value={form.email} onChange={set("email")} style={input} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Invoices via
              <select value={form.invoice_method} onChange={set("invoice_method")} style={input}>
                <option value="email">Email</option>
                <option value="mail">Mail</option>
              </select>
            </label>
            <label style={label}>Payment terms
              <select value={form.payment_terms} onChange={set("payment_terms")} style={input}>
                <option value="due on receipt">Due on receipt</option>
                <option value="net 15">Net 15</option>
                <option value="net 30">Net 30</option>
              </select>
            </label>
          </div>
          <label style={label}>Billing address (if different from site)
            <input value={form.billing_address} onChange={set("billing_address")} style={input} />
          </label>
          <h3 style={{ marginBottom: 0 }}>Work site</h3>
          <label style={label}>Site address
            <input value={form.site_address} onChange={set("site_address")} style={input} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>City
              <input value={form.site_city} onChange={set("site_city")} style={input} />
            </label>
            <label style={label}>ZIP
              <input value={form.site_zip} onChange={set("site_zip")} style={input} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Facility type
              <input value={form.facility_type} onChange={set("facility_type")} style={input} placeholder="e.g. office, warehouse" />
            </label>
            <label style={label}>Supplies provided by
              <select value={form.supplies_provider} onChange={set("supplies_provider")} style={input}>
                <option value="us">Us</option>
                <option value="client">Client</option>
              </select>
            </label>
          </div>
          <label style={label}>Site access (who gives key/code/alarm on day one)
            <textarea value={form.access_info} onChange={set("access_info")} rows={2} style={input} />
          </label>
          <label style={label}>Parking instructions
            <input value={form.parking_info} onChange={set("parking_info")} style={input} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>On-site contact name
              <input value={form.on_site_contact_name} onChange={set("on_site_contact_name")} style={input} />
            </label>
            <label style={label}>On-site contact phone
              <input value={form.on_site_contact_phone} onChange={set("on_site_contact_phone")} style={input} />
            </label>
          </div>
          <h3 style={{ marginBottom: 0 }}>Job requirements</h3>
          <div>
            <span style={label}>Standard task checklist</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {(form.task_checklist || []).map((t, i) => (
                <span key={i} className="badge" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {t}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, task_checklist: f.task_checklist.filter((_, x) => x !== i) }))}
                    style={{ border: "none", background: "none", cursor: "pointer" }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="Add a task, e.g. restrooms"
                style={{ ...input, marginTop: 0, flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListItem("task_checklist", taskInput, setTaskInput); } }} />
              <button type="button" className="btn-ghost" onClick={() => addListItem("task_checklist", taskInput, setTaskInput)}>Add</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Areas off limits
              <input value={form.off_limits} onChange={set("off_limits")} style={input} />
            </label>
            <label style={label}>Dress code / uniform
              <input value={form.dress_code} onChange={set("dress_code")} style={input} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Hazards on site
              <input value={form.hazards} onChange={set("hazards")} style={input} />
            </label>
            <label style={label}>PPE required
              <input value={form.ppe_required} onChange={set("ppe_required")} style={input} placeholder="gloves, goggles, non-slip shoes…" />
            </label>
          </div>
          <label style={label}>Minimum experience required
            <input value={form.min_experience} onChange={set("min_experience")} style={input} placeholder="e.g. entry-level OK" />
          </label>
          <div style={{ display: "flex", gap: 18 }}>
            <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!form.bg_check_required} onChange={set("bg_check_required")} />
              Requires background check
            </label>
            <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!form.drug_test_required} onChange={set("drug_test_required")} />
              Requires drug test
            </label>
          </div>
          <div>
            <span style={label}>Do-not-return list <span style={{ fontWeight: 400, color: "var(--muted)" }}>(private — never shown to clients)</span></span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {(form.do_not_return || []).map((t, i) => (
                <span key={i} className="badge" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {t}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, do_not_return: f.do_not_return.filter((_, x) => x !== i) }))}
                    style={{ border: "none", background: "none", cursor: "pointer" }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={dnrInput} onChange={(e) => setDnrInput(e.target.value)} placeholder="Name to never send back"
                style={{ ...input, marginTop: 0, flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListItem("do_not_return", dnrInput, setDnrInput); } }} />
              <button type="button" className="btn-ghost" onClick={() => addListItem("do_not_return", dnrInput, setDnrInput)}>Add</button>
            </div>
          </div>
          <label style={label}>Notes
            <textarea value={form.notes} onChange={set("notes")} rows={2} style={input} />
          </label>
          {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn-primary" style={{ padding: "10px 20px" }}>Save profile</button>
            <button type="button" className="btn-ghost" style={{ padding: "10px 20px" }} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="panel" style={{ padding: 24, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Client profiles ({profiles.length})</h2>
        <button className="btn-primary" style={{ padding: "8px 16px" }} onClick={startNew}>New client</button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        One-time intake per client. Pick a profile when creating a request to pre-fill it.
      </p>
      {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}
      {profiles.map((p) => (
        <div key={p.id} className="card" style={{ padding: 14, marginBottom: 10, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <strong>{p.business_name}</strong>
              <span className="badge" style={{ marginLeft: 8 }}>{typeLabels[p.staffing_type] || p.staffing_type}</span>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {[p.contact_first, p.contact_last].filter(Boolean).join(" ")}
                {p.phone ? ` · ${p.phone}` : ""}{p.email ? ` · ${p.email}` : ""}
                <br />
                {p.site_address ? `${p.site_address}${p.site_city ? `, ${p.site_city}` : ""}${p.site_zip ? ` ${p.site_zip}` : ""}` : "No site address yet"}
                {(p.do_not_return || []).length > 0 && (
                  <><br /><span style={{ color: "var(--danger, #c00)" }}>Do-not-return: {p.do_not_return.join(", ")}</span></>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <button className="btn-ghost" style={{ padding: "6px 14px" }} onClick={() => startEdit(p)}>Edit</button>
              <button className="btn-ghost" style={{ padding: "6px 14px" }} onClick={() => remove(p.id)}>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {profiles.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No client profiles yet. Add your first client to start reusing their intake.</p>
      )}
    </section>
  );
}

// ---------------- Shift offers (POINT 4) ----------------

export function OffersTab({ companyId, typeLabels, temps }) {
  const [offers, setOffers] = useState([]);
  const [msg, setMsg] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    tempMemberId: "", staffingType: "cleaning", clientName: "", siteAddress: "",
    shiftDate: "", startTime: "", endTime: "", payRate: "", respondBy: "",
    reportTo: "", parkingInfo: "", accessInfo: "",
  });

  async function load() {
    const token = await getToken();
    const r = await fetch(`/api/temp/offers?companyId=${companyId}`, { headers: authHeaders(token) });
    const j = await r.json();
    if (j.offers) setOffers(j.offers);
  }
  useEffect(() => { load(); }, [companyId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    setMsg("");
    const token = await getToken();
    const r = await fetch("/api/temp/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ companyId, ...form }),
    });
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || "Could not create offer."); return; }
    setShowNew(false);
    setForm({ tempMemberId: "", staffingType: "cleaning", clientName: "", siteAddress: "", shiftDate: "", startTime: "", endTime: "", payRate: "", respondBy: "", reportTo: "", parkingInfo: "", accessInfo: "" });
    setMsg("Offer sent.");
    load();
  }

  async function cancel(id) {
    const token = await getToken();
    const r = await fetch("/api/temp/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ id, companyId, action: "cancelled" }),
    });
    const j = await r.json();
    setMsg(j.ok ? "Offer cancelled." : j.error || "Cancel failed.");
    if (j.ok) load();
  }

  const openOffers = offers.filter((o) => o.status === "offered");

  return (
    <section className="panel" style={{ padding: 24, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Shift offers ({openOffers.length} open)</h2>
        <button className="btn-primary" style={{ padding: "8px 16px" }} onClick={() => setShowNew(!showNew)}>
          {showNew ? "Close" : "New offer"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Offer a shift to a temp. They accept or decline in the app; on accept the assignment is created automatically.
      </p>
      {msg && <p style={{ color: "var(--muted)", fontSize: 14 }}>{msg}</p>}

      {showNew && (
        <form onSubmit={create} className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Temp
              <select value={form.tempMemberId} onChange={set("tempMemberId")} style={input} required>
                <option value="">Choose…</option>
                {(temps || []).map((t) => (
                  <option key={t.member_id} value={t.member_id}>{t.full_name}</option>
                ))}
              </select>
            </label>
            <label style={label}>Lane
              <select value={form.staffingType} onChange={set("staffingType")} style={input}>
                <option value="cleaning">Cleaning / Janitorial</option>
                <option value="office">Office / Administrative</option>
                <option value="manufacturing">Manufacturing / Industrial</option>
                <option value="hospitality">Hospitality / Events</option>
                <option value="general_labor">General Labor</option>
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Client name
              <input value={form.clientName} onChange={set("clientName")} style={input} required />
            </label>
            <label style={label}>Site address
              <input value={form.siteAddress} onChange={set("siteAddress")} style={input} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={label}>Date
              <input type="date" value={form.shiftDate} onChange={set("shiftDate")} style={input} required />
            </label>
            <label style={label}>Start
              <input type="time" value={form.startTime} onChange={set("startTime")} style={input} required />
            </label>
            <label style={label}>End
              <input type="time" value={form.endTime} onChange={set("endTime")} style={input} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Pay rate ($/hour)
              <input type="number" step="0.01" min="0" value={form.payRate} onChange={set("payRate")} style={input} required />
            </label>
            <label style={label}>Respond by (optional)
              <input type="datetime-local" value={form.respondBy} onChange={set("respondBy")} style={input} />
            </label>
          </div>
          <label style={label}>Report to (shown on accept)
            <input value={form.reportTo} onChange={set("reportTo")} style={input} placeholder="Who to ask for on arrival" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>Parking (shown on accept)
              <input value={form.parkingInfo} onChange={set("parkingInfo")} style={input} />
            </label>
            <label style={label}>Access (shown on accept)
              <input value={form.accessInfo} onChange={set("accessInfo")} style={input} />
            </label>
          </div>
          <button type="submit" className="btn-primary" style={{ padding: "10px 20px" }}>Send offer</button>
        </form>
      )}

      {offers.map((o) => (
        <div key={o.id} className="card" style={{ padding: 14, marginBottom: 10, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <strong>{o.client_name}</strong>
              <span className="badge" style={{ marginLeft: 8 }}>{OFFER_STATUS[o.status] || o.status}</span>
              <span className="badge" style={{ marginLeft: 4 }}>{typeLabels[o.staffing_type] || o.staffing_type}</span>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {o.shift_date} · {o.start_time?.slice(0, 5)}–{o.end_time?.slice(0, 5)} · ${Number(o.pay_rate).toFixed(2)}/hr
                <br />{o.site_address}
                {o.respond_by && o.status === "offered" && (
                  <><br />Respond by {new Date(o.respond_by).toLocaleString()}</>
                )}
              </div>
            </div>
            {o.status === "offered" && (
              <button className="btn-ghost" style={{ padding: "6px 14px", alignSelf: "flex-start" }} onClick={() => cancel(o.id)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
      {offers.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No offers yet. Send your first offer to a temp above.</p>
      )}
    </section>
  );
}

export { DAYS };
