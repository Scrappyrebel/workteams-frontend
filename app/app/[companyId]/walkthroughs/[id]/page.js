"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUse } from "../../../../../lib/tiers";
import { STANDARD_TASKS } from "../../../../../lib/walkthrough-tasks";

const emptyArea = { area_name: "", length_ft: "", width_ft: "", square_footage: "", notes: "", custom_task: "" };

function dims(a) {
  return a.length_ft && a.width_ft ? `${a.length_ft} × ${a.width_ft} ft` : "measured";
}

function buildScope(walkthrough, areas) {
  const total = areas.reduce((s, a) => s + Number(a.square_footage || 0), 0);
  const lines = [];
  lines.push(`SCOPE OF WORK — ${walkthrough?.locations?.name || walkthrough?.name || ""}`);
  lines.push(`Total: ${Math.round(total).toLocaleString()} sq ft across ${areas.length} area${areas.length === 1 ? "" : "s"}`);
  lines.push("");
  areas.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.area_name} (${dims(a)} — ${Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft)`);
    const tasks = Array.isArray(a.tasks) ? a.tasks : [];
    tasks.forEach((t) => lines.push(`   • ${t}`));
    if (a.notes) lines.push(`   Note: ${a.notes}`);
  });
  return lines.join("\n");
}

export default function WalkthroughDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wid = params.id;
  const { company, member, loading } = useCompany();
  const [walkthrough, setWalkthrough] = useState(null);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(emptyArea);
  const [checked, setChecked] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [manualSqft, setManualSqft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingWt, setEditingWt] = useState(false);
  const [wtForm, setWtForm] = useState({ name: "", notes: "" });
  const [savingWt, setSavingWt] = useState(false);
  const [creatingWOs, setCreatingWOs] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "walkthroughs");

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("walkthroughs")
      .select("*, locations(name)")
      .eq("id", wid)
      .eq("company_id", company.id)
      .single();
    if (!data) {
      setLoadError("Couldn't open this walkthrough. It may have been deleted.");
      return;
    }
    setWalkthrough(data);
    const { data: ar } = await sb
      .from("walkthrough_areas")
      .select("*")
      .eq("walkthrough_id", wid)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setAreas(ar || []);
  }

  useEffect(() => {
    if (!loading && company && allowed && isManager) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  const totalSqft = areas.reduce((s, a) => s + Number(a.square_footage || 0), 0);

  function toggleTask(t) {
    setChecked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustomTask() {
    const t = form.custom_task.trim();
    if (!t) return;
    if (!checked.includes(t)) setChecked((prev) => [...prev, t]);
    setForm({ ...form, custom_task: "" });
  }

  function startEdit(a) {
    setEditing(a.id);
    setForm({ area_name: a.area_name, length_ft: a.length_ft != null ? String(a.length_ft) : "", width_ft: a.width_ft != null ? String(a.width_ft) : "", square_footage: String(a.square_footage ?? ""), notes: a.notes || "", custom_task: "" });
    setManualSqft(!(a.length_ft && a.width_ft));
    setChecked(Array.isArray(a.tasks) ? [...a.tasks] : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyArea);
    setChecked([]);
    setManualSqft(false);
  }

  async function saveArea(e) {
    e.preventDefault();
    if (!form.area_name.trim()) {
      alert("Give the area a name (e.g. Lobby, Restroom 1).");
      return;
    }
    setSaving(true);
    const payload = {
      area_name: form.area_name.trim(),
      length_ft: parseFloat(form.length_ft) || null,
      width_ft: parseFloat(form.width_ft) || null,
      square_footage: parseFloat(form.square_footage) || 0,
      tasks: checked,
      notes: form.notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase().from("walkthrough_areas").update(payload).eq("id", editing));
    } else {
      ({ error } = await supabase().from("walkthrough_areas").insert({
        walkthrough_id: wid,
        sort_order: areas.length,
        ...payload,
      }));
    }
    setSaving(false);
    if (error) alert("Could not save area: " + error.message);
    else {
      cancelEdit();
      load();
    }
  }

  async function removeArea(id) {
    if (!confirm("Delete this area?")) return;
    const { error } = await supabase().from("walkthrough_areas").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  async function copyScope() {
    const text = buildScope(walkthrough, areas);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        alert("Copy failed — select the text manually.");
      }
      document.body.removeChild(ta);
    }
  }

  async function useInBid() {
    const sb = supabase();
    if (walkthrough.bid_id) {
      // Link existing draft bid: fill its sqft total.
      const { error } = await sb
        .from("bids")
        .update({ pricing_mode: "sqft", square_footage: totalSqft })
        .eq("id", walkthrough.bid_id);
      if (error) alert("Could not update bid: " + error.message);
      else {
        alert("Bid updated with " + Math.round(totalSqft).toLocaleString() + " sq ft.");
        router.push(`/app/${company.id}/bids/${walkthrough.bid_id}`);
      }
      return;
    }
    // Create a new draft bid with sqft pricing pre-filled.
    const { data, error } = await sb
      .from("bids")
      .insert({
        company_id: company.id,
        location_id: walkthrough.location_id,
        client_name: walkthrough.locations?.name || walkthrough.name,
        title: `Cleaning bid — ${walkthrough.locations?.name || walkthrough.name}`,
        description: buildScope(walkthrough, areas),
        status: "draft",
        pricing_mode: "sqft",
        square_footage: totalSqft,
      })
      .select("id")
      .single();
    if (error) {
      alert("Could not create bid: " + error.message);
      return;
    }
    await sb.from("walkthroughs").update({ bid_id: data.id }).eq("id", wid);
    router.push(`/app/${company.id}/bids/${data.id}`);
  }

  async function createWorkOrders() {
    if (areas.length === 0) {
      alert("Add at least one area first.");
      return;
    }
    if (!confirm(`Create ${areas.length} work order${areas.length === 1 ? "" : "s"} (one per area)?`)) return;
    setCreatingWOs(true);
    const rows = areas.map((a) => ({
      company_id: company.id,
      location_id: walkthrough.location_id,
      title: `${a.area_name} — ${walkthrough.name}`,
      description: [
        `${dims(a)} — ${Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft`,
        ...(Array.isArray(a.tasks) ? a.tasks : []).map((t) => `• ${t}`),
        a.notes ? `Note: ${a.notes}` : null,
      ].filter(Boolean).join("\n"),
      priority: "normal",
      status: "open",
    }));
    const { error } = await supabase().from("work_orders").insert(rows);
    setCreatingWOs(false);
    if (error) alert("Could not create work orders: " + error.message);
    else {
      alert(`${rows.length} work order${rows.length === 1 ? "" : "s"} created.`);
      router.push(`/app/${company.id}/work-orders`);
    }
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed || !isManager) {
    return (
      <div>
        <p className="eyebrow">WALKTHROUGHS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Walkthroughs</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Room-by-room walkthroughs are a <strong>Pro</strong> feature for owners and managers.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <p className="eyebrow">WALKTHROUGHS</p>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>{loadError}</p>
          <Link href={`/app/${company.id}/walkthroughs`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            ← Back to walkthroughs
          </Link>
        </section>
      </div>
    );
  }
  if (!walkthrough) return <p>Loading…</p>;

  const scopeText = buildScope(walkthrough, areas);

  return (
    <div>
      <Link href={`/app/${company.id}/walkthroughs`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
        ← All walkthroughs
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>WALKTHROUGH</p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{walkthrough.name}</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
        {walkthrough.locations?.name || "No location"}
        {walkthrough.notes ? ` · ${walkthrough.notes}` : ""}
      </p>
      {!editingWt ? (
        <button
          onClick={() => { setWtForm({ name: walkthrough.name || "", notes: walkthrough.notes || "" }); setEditingWt(true); }}
          style={{ ...ghostBtnWide, marginBottom: 16 }}
        >
          Edit walkthrough details
        </button>
      ) : (
        <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={wtForm.name} onChange={(e) => setWtForm({ ...wtForm, name: e.target.value })} placeholder="Walkthrough name" style={input} />
            <input value={wtForm.notes} onChange={(e) => setWtForm({ ...wtForm, notes: e.target.value })} placeholder="Notes" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={savingWt}
                onClick={async () => {
                  if (!wtForm.name.trim()) { alert("Name is required."); return; }
                  setSavingWt(true);
                  const sb = supabase();
                  const { error } = await sb.from("walkthroughs").update({ name: wtForm.name.trim(), notes: wtForm.notes.trim() || null }).eq("id", wid);
                  setSavingWt(false);
                  if (error) alert("Could not save: " + error.message);
                  else { setWalkthrough({ ...walkthrough, name: wtForm.name.trim(), notes: wtForm.notes.trim() || null }); setEditingWt(false); }
                }}
                style={primaryBtn}
              >
                {savingWt ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingWt(false)} style={ghostBtnWide}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 18, marginBottom: 16, background: "var(--brand)", color: "#fff", border: "none" }}>
        <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>Total square footage</div>
        <div style={{ fontSize: "2rem", fontWeight: 800 }}>{Math.round(totalSqft).toLocaleString()} sq ft</div>
        <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
          {areas.length} area{areas.length === 1 ? "" : "s"} measured
        </div>
      </div>

      <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>{editing ? "Edit area" : "Add area"}</h3>
        <form onSubmit={saveArea} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={form.area_name}
            onChange={(e) => setForm({ ...form, area_name: e.target.value })}
            placeholder="Area name (e.g. Boss's office, Restroom 1)"
            maxLength={120}
            style={input}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Length (ft)
              <input
                value={form.length_ft}
                onChange={(e) => {
                  const v = e.target.value;
                  const l = parseFloat(v) || 0, w = parseFloat(form.width_ft) || 0;
                  setForm({ ...form, length_ft: v, square_footage: l && w ? String(Math.round(l * w * 100) / 100) : form.square_footage });
                  setManualSqft(false);
                }}
                placeholder="e.g. 20"
                inputMode="decimal"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <span style={{ fontSize: "1.2rem", fontWeight: 800, paddingBottom: 12 }}>×</span>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Width (ft)
              <input
                value={form.width_ft}
                onChange={(e) => {
                  const v = e.target.value;
                  const l = parseFloat(form.length_ft) || 0, w = parseFloat(v) || 0;
                  setForm({ ...form, width_ft: v, square_footage: l && w ? String(Math.round(l * w * 100) / 100) : form.square_footage });
                  setManualSqft(false);
                }}
                placeholder="e.g. 12.5"
                inputMode="decimal"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "#f7f5f0", fontWeight: 800 }}>
              = {form.square_footage ? Number(form.square_footage).toLocaleString() : "—"} sq ft
            </div>
          </div>
          {manualSqft ? (
            <input
              value={form.square_footage}
              onChange={(e) => setForm({ ...form, square_footage: e.target.value })}
              placeholder="Square footage"
              inputMode="decimal"
              style={input}
            />
          ) : (
            <button type="button" onClick={() => setManualSqft(true)} style={{ ...ghostBtn, alignSelf: "flex-start" }}>
              Enter sq ft directly (odd-shaped room)
            </button>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 8 }}>What needs cleaning here?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STANDARD_TASKS.map((t) => {
                const on = checked.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTask(t)}
                    style={{
                      ...chip,
                      background: on ? "var(--brand)" : "#fff",
                      color: on ? "#fff" : "var(--ink)",
                      border: on ? "1px solid var(--brand)" : "1px solid var(--line)",
                    }}
                  >
                    {on ? "✓ " : ""}{t}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={form.custom_task}
                onChange={(e) => setForm({ ...form, custom_task: e.target.value })}
                placeholder="Custom task…"
                maxLength={80}
                style={{ ...input, flex: 1 }}
              />
              <button type="button" onClick={addCustomTask} style={ghostBtn}>Add</button>
            </div>
            {checked.filter((t) => !STANDARD_TASKS.includes(t)).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {checked.filter((t) => !STANDARD_TASKS.includes(t)).map((t) => (
                  <button key={t} type="button" onClick={() => toggleTask(t)} style={{ ...chip, background: "var(--brand)", color: "#fff", border: "1px solid var(--brand)" }}>
                    ✓ {t} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Area notes (optional)"
            rows={2}
            style={{ ...input, borderRadius: 14 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, flex: 1 }}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add area"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>
            )}
          </div>
        </form>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {areas.map((a, i) => (
          <div key={a.id} className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>
                  {i + 1}. {a.area_name}
                  <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {dims(a)} · {Math.round(Number(a.square_footage || 0)).toLocaleString()} sq ft</span>
                </div>
                {(Array.isArray(a.tasks) ? a.tasks : []).length > 0 ? (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.9rem" }}>
                    {(Array.isArray(a.tasks) ? a.tasks : []).map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>No tasks checked</div>
                )}
                {a.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>Note: {a.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => startEdit(a)} style={ghostBtn}>Edit</button>
                <button onClick={() => removeArea(a.id)} style={dangerGhost}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {areas.length > 0 && (
        <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "1.1rem" }}>Scope of work</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", background: "var(--surface-muted, #f6f7f9)", padding: 12, borderRadius: 10, margin: "0 0 12px" }}>
            {scopeText}
          </pre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={copyScope} style={primaryBtn}>{copied ? "Copied ✓" : "Copy scope of work"}</button>
            <button onClick={useInBid} style={ghostBtnWide}>
              {walkthrough.bid_id ? "Update linked bid with this total" : "Use in bid (sq ft pricing)"}
            </button>
            <button onClick={createWorkOrders} disabled={creatingWOs} style={ghostBtnWide}>
              {creatingWOs ? "Creating…" : `Create work orders (${areas.length})`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

const input = {
  padding: "12px 16px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const primaryBtn = {
  padding: "14px 24px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1rem",
  cursor: "pointer",
};

const ghostBtn = {
  padding: "12px 20px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const ghostBtnWide = {
  padding: "14px 24px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#fff",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  width: "100%",
};

const chip = {
  padding: "12px 16px",
  borderRadius: 999,
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerGhost = {
  border: "1px solid #f3c1c1",
  background: "#fff",
  color: "#c0392b",
  borderRadius: 999,
  width: 36,
  height: 36,
  cursor: "pointer",
  flexShrink: 0,
};
