"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../lib/use-clocked-in";
import { canUseWithRole } from "../../../../lib/tiers";

const emptyForm = {
  name: "",
  category: "",
  quantity_on_hand: "0",
  unit: "units",
  reorder_level: "0",
  cost_per_unit: "",
  notes: "",
};

const CONDITION_LABEL = {
  good: "Good",
  needs_repair: "Needs repair",
  broken: "Broken",
  replaced: "Replaced",
};

function conditionOf(item) {
  return item?.condition && CONDITION_LABEL[item.condition] ? item.condition : "good";
}

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

function fmtWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function SuppliesPage() {
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  // Inventory control (migration 078). Everything below is additive and
  // fail-soft: until 078 runs, the probes fail quietly and the page
  // behaves exactly as the plain supplies list always has.
  const [invReady, setInvReady] = useState(false);
  const [roster, setRoster] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [changeNote, setChangeNote] = useState("");
  const [jobReference, setJobReference] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState({ movements: [], events: [], assignments: [] });
  const [checkoutFor, setCheckoutFor] = useState(null);
  const [checkoutForm, setCheckoutForm] = useState({ memberId: "", quantity: "1", due: "", note: "" });
  const [returnFor, setReturnFor] = useState(null);
  const [returnCondition, setReturnCondition] = useState("good");
  const [replaceFor, setReplaceFor] = useState(null);
  const [replaceForm, setReplaceForm] = useState({ replacementId: "", note: "" });
  const [requestForm, setRequestForm] = useState({ supplyId: "", quantity: "1", neededBy: "", note: "" });
  const [requestSaving, setRequestSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "supplies", member?.role);

  async function load() {
    const { data } = await supabase()
      .from("supplies")
      .select("*")
      .eq("company_id", company.id)
      .order("name");
    setItems(data || []);
  }

  // Member view loads the same list WITHOUT the cost column: who can see
  // costs does not widen with this upgrade.
  async function loadMemberItems() {
    const cols = "id, company_id, name, category, quantity_on_hand, unit, reorder_level, notes, condition";
    let { data, error } = await supabase()
      .from("supplies")
      .select(cols)
      .eq("company_id", company.id)
      .order("name");
    if (error) {
      ({ data } = await supabase()
        .from("supplies")
        .select("id, company_id, name, category, quantity_on_hand, unit, reorder_level, notes")
        .eq("company_id", company.id)
        .order("name"));
    }
    setItems(data || []);
  }

  // Probes + loads for the inventory-control tables. Any failure leaves
  // invReady false and the new sections simply stay off.
  async function loadInventory() {
    try {
      const [rosterRes, assignRes, requestRes] = await Promise.all([
        supabase().from("team_directory").select("id, display_name, role").eq("company_id", company.id),
        supabase()
          .from("supply_assignments")
          .select("*")
          .eq("company_id", company.id)
          .order("checked_out_at", { ascending: false })
          .limit(200),
        supabase()
          .from("supply_restock_requests")
          .select("*")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (rosterRes.data) setRoster(rosterRes.data);
      if (assignRes.error || requestRes.error) {
        setInvReady(false);
        return;
      }
      setAssignments(assignRes.data || []);
      setRequests(requestRes.data || []);
      setInvReady(true);
    } catch {
      setInvReady(false);
    }
  }

  useEffect(() => {
    if (!loading && company && allowed) {
      if (isManager) load();
      else loadMemberItems();
      loadInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  function nameOf(memberId, fallbackName) {
    if (fallbackName) return fallbackName;
    const found = roster.find((r) => r.id === memberId);
    return found ? found.display_name || "Unknown" : "A former member";
  }

  // Best-effort movement record. A missing log table (pre-078) or any
  // other failure never blocks the stock change itself.
  async function recordMovement(supplyId, movementType, quantityChange, quantityAfter, note, jobRef) {
    try {
      await supabase().from("supply_movements").insert({
        company_id: company.id,
        supply_id: supplyId,
        movement_type: movementType,
        quantity_change: quantityChange,
        quantity_after: quantityAfter,
        member_id: member.id,
        note: note?.trim() || null,
        job_reference: jobRef?.trim() || null,
      });
    } catch {
      /* history turns on when migration 078 runs */
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "add a supply item")) return;
    if (!form.name.trim()) {
      alert("Name the supply.");
      return;
    }
    setSaving(true);
    const payload = {
      company_id: company.id,
      name: form.name.trim(),
      category: form.category.trim() || null,
      quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
      unit: form.unit.trim() || "units",
      reorder_level: parseFloat(form.reorder_level) || 0,
      cost_per_unit: form.cost_per_unit === "" ? null : parseFloat(form.cost_per_unit),
      notes: form.notes.trim() || null,
    };
    let error;
    let savedId = editing;
    const original = editing ? items.find((i) => i.id === editing) : null;
    if (editing) {
      ({ error } = await supabase().from("supplies").update(payload).eq("id", editing));
    } else {
      const res = await supabase().from("supplies").insert(payload).select("id").single();
      error = res.error;
      savedId = res.data?.id || null;
    }
    setSaving(false);
    if (error) alert("Could not save: " + error.message);
    else {
      // Record the quantity side of the save in the movement history:
      // a new item's starting stock is an "in"; an edit that changed the
      // count is an "adjustment" for the difference.
      if (savedId) {
        if (!editing && payload.quantity_on_hand !== 0) {
          await recordMovement(savedId, "in", payload.quantity_on_hand, payload.quantity_on_hand, changeNote, jobReference);
        } else if (editing && original) {
          const delta = payload.quantity_on_hand - Number(original.quantity_on_hand);
          if (delta !== 0) {
            await recordMovement(savedId, "adjustment", delta, payload.quantity_on_hand, changeNote, jobReference);
          }
        }
      }
      setForm(emptyForm);
      setEditing(null);
      setChangeNote("");
      setJobReference("");
      load();
    }
  }

  async function adjust(id, delta) {
    if (!requireClockedIn(clockedIn, "adjust inventory")) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = Math.max(0, Number(item.quantity_on_hand) + delta);
    const { error } = await supabase().from("supplies").update({ quantity_on_hand: next }).eq("id", id);
    if (error) alert("Could not adjust: " + error.message);
    else {
      const applied = next - Number(item.quantity_on_hand);
      if (applied !== 0) {
        await recordMovement(id, applied > 0 ? "in" : "out", applied, next, null, null);
      }
      load();
    }
  }

  async function removeItem(id, name) {
    if (!requireClockedIn(clockedIn, "remove a supply item")) return;
    if (!confirm(`Delete "${name}" from inventory?`)) return;
    const { error } = await supabase().from("supplies").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  function startEdit(item) {
    setEditing(item.id);
    setForm({
      name: item.name,
      category: item.category || "",
      quantity_on_hand: String(item.quantity_on_hand),
      unit: item.unit || "units",
      reorder_level: String(item.reorder_level),
      cost_per_unit: item.cost_per_unit == null ? "" : String(item.cost_per_unit),
      notes: item.notes || "",
    });
    setChangeNote("");
    setJobReference("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleHistory(item) {
    if (historyFor === item.id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(item.id);
    setHistory({ movements: [], events: [], assignments: [] });
    try {
      const [mv, ev, asg] = await Promise.all([
        supabase()
          .from("supply_movements")
          .select("*")
          .eq("supply_id", item.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase()
          .from("supply_condition_events")
          .select("*")
          .eq("supply_id", item.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase()
          .from("supply_assignments")
          .select("*")
          .eq("supply_id", item.id)
          .order("checked_out_at", { ascending: false })
          .limit(100),
      ]);
      setHistory({
        movements: mv.data || [],
        events: ev.data || [],
        assignments: asg.data || [],
      });
    } catch {
      /* history turns on when migration 078 runs */
    }
  }

  async function setCondition(item, next) {
    if (!requireClockedIn(clockedIn, "update an item's condition")) return;
    const from = conditionOf(item);
    if (next === from) return;
    const { error } = await supabase().from("supplies").update({ condition: next }).eq("id", item.id);
    if (error) {
      alert("Could not update condition: " + error.message);
      return;
    }
    try {
      await supabase().from("supply_condition_events").insert({
        company_id: company.id,
        supply_id: item.id,
        event_type: "condition_change",
        from_condition: from,
        to_condition: next,
        member_id: member.id,
        note: null,
      });
    } catch {
      /* event log turns on when migration 078 runs */
    }
    load();
  }

  async function recordReplacement(item) {
    if (!requireClockedIn(clockedIn, "record a replacement")) return;
    const replacement = items.find((i) => i.id === replaceForm.replacementId);
    if (!replacement) {
      alert("Pick the item that replaced it.");
      return;
    }
    const from = conditionOf(item);
    const { error } = await supabase().from("supplies").update({ condition: "replaced" }).eq("id", item.id);
    if (error) {
      alert("Could not record the replacement: " + error.message);
      return;
    }
    try {
      await supabase().from("supply_condition_events").insert({
        company_id: company.id,
        supply_id: item.id,
        event_type: "replacement",
        from_condition: from,
        to_condition: "replaced",
        replacement_supply_id: replacement.id,
        replacement_name: replacement.name,
        member_id: member.id,
        note: replaceForm.note.trim() || null,
      });
    } catch {
      /* event log turns on when migration 078 runs */
    }
    setReplaceFor(null);
    setReplaceForm({ replacementId: "", note: "" });
    load();
  }

  async function checkout(item) {
    if (!requireClockedIn(clockedIn, "check out an item")) return;
    const holder = roster.find((r) => r.id === checkoutForm.memberId);
    if (!holder) {
      alert("Pick who is taking it.");
      return;
    }
    const qty = parseFloat(checkoutForm.quantity) || 0;
    if (qty <= 0) {
      alert("Quantity must be at least 1.");
      return;
    }
    const { error } = await supabase().from("supply_assignments").insert({
      company_id: company.id,
      supply_id: item.id,
      assigned_to_member_id: holder.id,
      assigned_to_name: holder.display_name || "Unknown",
      assigned_by_member_id: member.id,
      quantity: qty,
      due_back_at: checkoutForm.due || null,
      note: checkoutForm.note.trim() || null,
    });
    if (error) alert("Could not check out: " + error.message);
    else {
      setCheckoutFor(null);
      setCheckoutForm({ memberId: "", quantity: "1", due: "", note: "" });
      loadInventory();
    }
  }

  async function returnAssignment(assignment, item) {
    if (!requireClockedIn(clockedIn, "return an item")) return;
    const { error } = await supabase()
      .from("supply_assignments")
      .update({ returned_at: new Date().toISOString(), return_condition: returnCondition })
      .eq("id", assignment.id);
    if (error) {
      alert("Could not record the return: " + error.message);
      return;
    }
    // Damage found on return moves the item's condition and is recorded
    // as a condition event, so breakage is never a silent edit.
    if (item && returnCondition !== "good" && conditionOf(item) !== "replaced") {
      const { error: condError } = await supabase()
        .from("supplies")
        .update({ condition: returnCondition })
        .eq("id", item.id);
      if (!condError) {
        try {
          await supabase().from("supply_condition_events").insert({
            company_id: company.id,
            supply_id: item.id,
            event_type: "condition_change",
            from_condition: conditionOf(item),
            to_condition: returnCondition,
            member_id: member.id,
            note: "Reported on return",
          });
        } catch {
          /* event log turns on when migration 078 runs */
        }
        load();
      }
    }
    setReturnFor(null);
    setReturnCondition("good");
    loadInventory();
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "request a restock")) return;
    const item = items.find((i) => i.id === requestForm.supplyId);
    if (!item) {
      alert("Pick the item you need.");
      return;
    }
    const qty = parseFloat(requestForm.quantity) || 0;
    if (qty <= 0) {
      alert("Quantity must be at least 1.");
      return;
    }
    setRequestSaving(true);
    const { error } = await supabase().from("supply_restock_requests").insert({
      company_id: company.id,
      supply_id: item.id,
      supply_name: item.name,
      requested_by_member_id: member.id,
      quantity: qty,
      needed_by: requestForm.neededBy || null,
      note: requestForm.note.trim() || null,
    });
    setRequestSaving(false);
    if (error) alert("Could not send the request: " + error.message);
    else {
      setRequestForm({ supplyId: "", quantity: "1", neededBy: "", note: "" });
      loadInventory();
    }
  }

  async function handleRequest(request, status) {
    if (!requireClockedIn(clockedIn, "update a restock request")) return;
    const { error } = await supabase()
      .from("supply_restock_requests")
      .update({ status, handled_by_member_id: member.id, handled_at: new Date().toISOString() })
      .eq("id", request.id);
    if (error) alert("Could not update the request: " + error.message);
    else loadInventory();
  }

  function openAssignmentsFor(itemId) {
    return assignments.filter((a) => a.supply_id === itemId && !a.returned_at);
  }

  function conditionBadge(item) {
    const c = conditionOf(item);
    if (c === "good") return null;
    const style =
      c === "broken"
        ? { color: "#b3261e", fontWeight: 800 }
        : c === "needs_repair"
          ? { color: "#9a6a00", fontWeight: 800 }
          : { color: "var(--muted)", fontWeight: 800 };
    return <span style={style}> • {c === "broken" ? "✖ broken" : c === "needs_repair" ? "🔧 needs repair" : "replaced"}</span>;
  }

  function restockSection() {
    if (!invReady) {
      return (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Restock requests</h3>
          <p style={{ color: "var(--muted)" }}>Restock requests turn on with the latest WorkTeams update.</p>
        </section>
      );
    }
    const open = requests.filter((r) => r.status === "open");
    const closed = requests.filter((r) => r.status !== "open");
    const ordered = [...open, ...closed];
    return (
      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Restock requests</h3>
        <form onSubmit={submitRequest} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <select
            value={requestForm.supplyId}
            onChange={(e) => setRequestForm({ ...requestForm, supplyId: e.target.value })}
            style={input}
            required
          >
            <option value="">Pick the item you need…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({Number(i.quantity_on_hand)} {i.unit} on hand)
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              How many
              <input
                type="number"
                min="0"
                step="any"
                value={requestForm.quantity}
                onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Needed by
              <input
                type="date"
                value={requestForm.neededBy}
                onChange={(e) => setRequestForm({ ...requestForm, neededBy: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <input
            value={requestForm.note}
            onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })}
            placeholder="Note (optional)"
            style={input}
          />
          <button type="submit" disabled={requestSaving} style={button}>
            {requestSaving ? "Sending…" : "Request restock"}
          </button>
        </form>
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          {ordered.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>No restock requests yet.</p>}
          {ordered.map((r) => {
            const overdue = r.status === "open" && r.needed_by && new Date(r.needed_by) < new Date(new Date().toDateString());
            return (
              <div key={r.id} style={{ fontSize: "0.92rem" }}>
                <strong>{r.supply_name}</strong> × {Number(r.quantity)}
                {r.needed_by ? ` • needed by ${fmtDate(r.needed_by)}` : ""}
                {overdue && <span style={{ color: "#b3261e", fontWeight: 800 }}> • overdue</span>}
                <span style={{ color: "var(--muted)" }}>
                  {" "}• asked by {nameOf(r.requested_by_member_id, null)}
                  {r.note ? ` • ${r.note}` : ""}
                  {r.status === "handled" ? ` • ✅ handled by ${nameOf(r.handled_by_member_id, null)}` : ""}
                  {r.status === "dismissed" ? ` • dismissed by ${nameOf(r.handled_by_member_id, null)}` : ""}
                </span>
                {isManager && r.status === "open" && (
                  <span style={{ marginLeft: 8 }}>
                    <button onClick={() => handleRequest(r, "handled")} style={smallGhostButton}>Mark handled</button>{" "}
                    <button onClick={() => handleRequest(r, "dismissed")} style={smallGhostButton}>Dismiss</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">SUPPLIES</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Supplies</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Supply tracking is a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  const lowStock = items.filter((i) => Number(i.quantity_on_hand) <= Number(i.reorder_level));

  // ---- Member view: the list, who has what, and restock requests.
  // No costs, no editing — costs stay manager-only, exactly as before.
  if (!isManager) {
    const mine = assignments.filter((a) => a.assigned_to_member_id === member.id && !a.returned_at);
    return (
      <div>
        <p className="eyebrow">SUPPLIES</p>
        <h2 style={{ fontSize: "1.8rem" }}>Supply inventory</h2>
        {lowStock.length > 0 && (
          <p style={{ color: "#b3261e", fontWeight: 700 }}>
            ⚠️ {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below reorder level
          </p>
        )}
        {invReady && mine.length > 0 && (
          <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
            <h3 style={{ marginTop: 0 }}>Checked out to you</h3>
            {mine.map((a) => {
              const item = items.find((i) => i.id === a.supply_id);
              return (
                <p key={a.id} style={{ margin: "6px 0" }}>
                  <strong>{item ? item.name : "An item"}</strong> × {Number(a.quantity)}
                  {a.due_back_at ? ` • due back ${fmtDate(a.due_back_at)}` : ""}
                  {a.note ? ` • ${a.note}` : ""}
                </p>
              );
            })}
          </section>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          {items.length === 0 && <p style={{ color: "var(--muted)" }}>No supplies tracked yet.</p>}
          {items.map((i) => {
            const low = Number(i.quantity_on_hand) <= Number(i.reorder_level);
            const out = openAssignmentsFor(i.id);
            return (
              <div
                key={i.id}
                className="portal-card"
                style={{
                  minHeight: 0,
                  padding: "14px 18px",
                  borderLeft: low ? "4px solid #b3261e" : undefined,
                }}
              >
                <strong>{i.name}</strong>
                {low && <span style={{ color: "#b3261e", fontWeight: 800 }}> ⚠️ low</span>}
                {conditionBadge(i)}
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {i.category ? `${i.category} • ` : ""}
                  {Number(i.quantity_on_hand)} {i.unit} on hand
                </div>
                {i.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{i.notes}</div>}
                {out.map((a) => (
                  <div key={a.id} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    📤 Out with {nameOf(a.assigned_to_member_id, a.assigned_to_name)} × {Number(a.quantity)}
                    {a.due_back_at ? ` • due back ${fmtDate(a.due_back_at)}` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {restockSection()}
      </div>
    );
  }

  // ---- Manager view: the original page, extended.
  const needsAttention = items.filter((i) => ["needs_repair", "broken"].includes(conditionOf(i)));

  return (
    <div>
      <p className="eyebrow">SUPPLIES</p>
      <h2 style={{ fontSize: "1.8rem" }}>Supply inventory</h2>
      {lowStock.length > 0 && (
        <p style={{ color: "#b3261e", fontWeight: 700 }}>
          ⚠️ {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below reorder level
        </p>
      )}
      {invReady && needsAttention.length > 0 && (
        <p style={{ color: "#9a6a00", fontWeight: 700 }}>
          🔧 {needsAttention.length} item{needsAttention.length === 1 ? "" : "s"} need{needsAttention.length === 1 ? "s" : ""} repair or {needsAttention.length === 1 ? "is" : "are"} broken
        </p>
      )}

      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>{editing ? "Edit supply" : "Add supply"}</h3>
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (e.g. All-purpose cleaner)"
            required
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Category (optional)"
              style={{ ...input, flex: 1 }}
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Unit (bottles, rolls…)"
              style={{ ...input, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              On hand
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity_on_hand}
                onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Reorder at
              <input
                type="number"
                min="0"
                step="any"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
              Cost each ($)
              <input
                type="number"
                min="0"
                step="any"
                value={form.cost_per_unit}
                onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
                placeholder="Optional"
                style={{ ...input, marginTop: 6 }}
              />
            </label>
          </div>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)"
            style={input}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Stock change note (optional)"
              style={{ ...input, flex: 1 }}
            />
            <input
              value={jobReference}
              onChange={(e) => setJobReference(e.target.value)}
              placeholder="Job / location (optional)"
              style={{ ...input, flex: 1 }}
            />
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
            The note and job are saved to the item's movement history when the on-hand count changes.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...button, flex: 1 }}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add supply"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => { setEditing(null); setForm(emptyForm); setChangeNote(""); setJobReference(""); }}
                style={ghostButton}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {items.length === 0 && <p style={{ color: "var(--muted)" }}>No supplies tracked yet.</p>}
        {items.map((i) => {
          const low = Number(i.quantity_on_hand) <= Number(i.reorder_level);
          const cond = conditionOf(i);
          const out = openAssignmentsFor(i.id);
          return (
            <div
              key={i.id}
              className="portal-card"
              style={{
                minHeight: 0,
                padding: "14px 18px",
                borderLeft: low ? "4px solid #b3261e" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <strong>{i.name}</strong>
                  {low && <span style={{ color: "#b3261e", fontWeight: 800 }}> ⚠️ low</span>}
                  {invReady && conditionBadge(i)}
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {i.category ? `${i.category} • ` : ""}
                    {Number(i.quantity_on_hand)} {i.unit} on hand
                    {i.cost_per_unit != null ? ` • $${Number(i.cost_per_unit).toFixed(2)} each` : ""}
                  </div>
                  {i.notes && <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{i.notes}</div>}
                  {invReady && out.map((a) => (
                    <div key={a.id} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      📤 Out with {nameOf(a.assigned_to_member_id, a.assigned_to_name)} × {Number(a.quantity)}
                      {a.due_back_at ? ` • due back ${fmtDate(a.due_back_at)}` : ""}
                      {a.note ? ` • ${a.note}` : ""}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button onClick={() => adjust(i.id, -1)} style={stepButton} aria-label="Use one">−</button>
                  <button onClick={() => adjust(i.id, 1)} style={stepButton} aria-label="Add one">+</button>
                </div>
              </div>

              {invReady && out.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {out.map((a) => (
                    <div key={a.id}>
                      {returnFor === a.id ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.9rem" }}>Came back:</span>
                          <select
                            value={returnCondition}
                            onChange={(e) => setReturnCondition(e.target.value)}
                            style={{ ...input, width: "auto", padding: "8px 10px" }}
                          >
                            <option value="good">Good</option>
                            <option value="needs_repair">Needs repair</option>
                            <option value="broken">Broken</option>
                          </select>
                          <button onClick={() => returnAssignment(a, i)} style={smallGhostButton}>Record return</button>
                          <button onClick={() => setReturnFor(null)} style={smallGhostButton}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => { setReturnFor(a.id); setReturnCondition("good"); }} style={smallGhostButton}>
                          Return from {nameOf(a.assigned_to_member_id, a.assigned_to_name)}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => startEdit(i)} style={ghostButton}>Edit</button>
                <button onClick={() => removeItem(i.id, i.name)} style={dangerButton}>Delete</button>
                {invReady && (
                  <>
                    <button onClick={() => toggleHistory(i)} style={ghostButton}>
                      {historyFor === i.id ? "Hide history" : "History"}
                    </button>
                    {cond !== "replaced" && (
                      <button
                        onClick={() => {
                          setCheckoutFor(checkoutFor === i.id ? null : i.id);
                          setCheckoutForm({ memberId: "", quantity: "1", due: "", note: "" });
                        }}
                        style={ghostButton}
                      >
                        Check out
                      </button>
                    )}
                    {cond !== "replaced" && (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem", color: "var(--muted)" }}>
                        Condition
                        <select
                          value={cond}
                          onChange={(e) => setCondition(i, e.target.value)}
                          style={{ ...input, width: "auto", padding: "8px 10px" }}
                        >
                          <option value="good">Good</option>
                          <option value="needs_repair">Needs repair</option>
                          <option value="broken">Broken</option>
                        </select>
                      </label>
                    )}
                    {(cond === "needs_repair" || cond === "broken") && (
                      <button
                        onClick={() => {
                          setReplaceFor(replaceFor === i.id ? null : i.id);
                          setReplaceForm({ replacementId: "", note: "" });
                        }}
                        style={ghostButton}
                      >
                        Record replacement
                      </button>
                    )}
                  </>
                )}
              </div>

              {invReady && checkoutFor === i.id && (
                <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 520 }}>
                  <select
                    value={checkoutForm.memberId}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, memberId: e.target.value })}
                    style={input}
                  >
                    <option value="">Who is taking it…</option>
                    {roster.map((r) => (
                      <option key={r.id} value={r.id}>{r.display_name || "Unknown"}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                      How many
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={checkoutForm.quantity}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, quantity: e.target.value })}
                        style={{ ...input, marginTop: 6 }}
                      />
                    </label>
                    <label style={{ flex: 1, fontSize: "0.9rem", color: "var(--muted)" }}>
                      Due back
                      <input
                        type="date"
                        value={checkoutForm.due}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, due: e.target.value })}
                        style={{ ...input, marginTop: 6 }}
                      />
                    </label>
                  </div>
                  <input
                    value={checkoutForm.note}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, note: e.target.value })}
                    placeholder="Note (optional)"
                    style={input}
                  />
                  <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
                    Checking out tracks who has it — it does not change the on-hand count.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => checkout(i)} style={button}>Check out</button>
                    <button onClick={() => setCheckoutFor(null)} style={ghostButton}>Cancel</button>
                  </div>
                </div>
              )}

              {invReady && replaceFor === i.id && (
                <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 520 }}>
                  <select
                    value={replaceForm.replacementId}
                    onChange={(e) => setReplaceForm({ ...replaceForm, replacementId: e.target.value })}
                    style={input}
                  >
                    <option value="">What replaced it…</option>
                    {items
                      .filter((o) => o.id !== i.id && conditionOf(o) !== "replaced")
                      .map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                  </select>
                  <input
                    value={replaceForm.note}
                    onChange={(e) => setReplaceForm({ ...replaceForm, note: e.target.value })}
                    placeholder="Note (optional)"
                    style={input}
                  />
                  <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
                    This marks “{i.name}” as replaced and records the replacement in its history. The old item stays on the list so its history is kept.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => recordReplacement(i)} style={button}>Record replacement</button>
                    <button onClick={() => setReplaceFor(null)} style={ghostButton}>Cancel</button>
                  </div>
                </div>
              )}

              {invReady && historyFor === i.id && (
                <div style={{ marginTop: 12, fontSize: "0.9rem", display: "grid", gap: 12 }}>
                  <div>
                    <strong>Stock movements</strong>
                    {history.movements.length === 0 && <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>No movements recorded yet.</p>}
                    {history.movements.map((m) => (
                      <p key={m.id} style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                        {fmtWhen(m.created_at)} — {m.movement_type === "in" ? "In" : m.movement_type === "out" ? "Out" : "Adjustment"}{" "}
                        {Number(m.quantity_change) > 0 ? "+" : ""}{Number(m.quantity_change)} (now {Number(m.quantity_after)} on hand) — {nameOf(m.member_id, null)}
                        {m.job_reference ? ` • ${m.job_reference}` : ""}
                        {m.note ? ` • ${m.note}` : ""}
                      </p>
                    ))}
                  </div>
                  <div>
                    <strong>Condition history</strong>
                    {history.events.length === 0 && <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>No condition changes recorded yet.</p>}
                    {history.events.map((ev) => (
                      <p key={ev.id} style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                        {fmtWhen(ev.created_at)} —{" "}
                        {ev.event_type === "replacement"
                          ? `Replaced by ${ev.replacement_name || "another item"}`
                          : `Condition: ${CONDITION_LABEL[ev.from_condition] || ev.from_condition || "—"} → ${CONDITION_LABEL[ev.to_condition] || ev.to_condition || "—"}`}
                        {" "}— {nameOf(ev.member_id, null)}
                        {ev.note ? ` • ${ev.note}` : ""}
                      </p>
                    ))}
                  </div>
                  <div>
                    <strong>Check-out history</strong>
                    {history.assignments.length === 0 && <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>Never checked out.</p>}
                    {history.assignments.map((a) => (
                      <p key={a.id} style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                        {fmtWhen(a.checked_out_at)} — out to {nameOf(a.assigned_to_member_id, a.assigned_to_name)} × {Number(a.quantity)}
                        {a.due_back_at ? ` • due back ${fmtDate(a.due_back_at)}` : ""}
                        {a.returned_at
                          ? ` • returned ${fmtWhen(a.returned_at)} (${CONDITION_LABEL[a.return_condition] || a.return_condition || "good"})`
                          : " • still out"}
                        {a.note ? ` • ${a.note}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {restockSection()}
    </div>
  );
}

const input = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontSize: "1rem",
  width: "100%",
};

const button = {
  padding: "12px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "9px 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const smallGhostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "5px 12px",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #f0c9c4",
  background: "#fff",
  color: "#b3261e",
  borderRadius: 999,
  padding: "9px 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const stepButton = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "1px solid var(--line)",
  background: "#fff",
  fontSize: "1.3rem",
  fontWeight: 800,
  cursor: "pointer",
};
