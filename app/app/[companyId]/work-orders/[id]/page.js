"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { useClockedIn, requireClockedIn } from "../../../../../lib/use-clocked-in";
import { canUseWithRole } from "../../../../../lib/tiers";
import WorkOrderCustomerPublication from "../../../../../components/WorkOrderCustomerPublication";
import {
  loadWorkOrderEvents,
  recordWorkOrderEvent,
  latestCompletionRecord,
  latestCancellationRecord,
} from "../../../../../lib/work-order-events";

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;
  const { company, member, loading } = useCompany();
  const { clockedIn } = useClockedIn();
  const [order, setOrder] = useState(null);
  const [members, setMembers] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  // Depth (D-WT-30): assignee display name, recorded events, and the
  // optional completion / cancellation text captured alongside a
  // status change. All additive — nothing below changes an existing
  // load, update, or notification.
  const [assigneeName, setAssigneeName] = useState("");
  const [events, setEvents] = useState([]);
  const [eventsOk, setEventsOk] = useState(false);
  const [actorNames, setActorNames] = useState({});
  const [signoffName, setSignoffName] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "workorders", member?.role);

  async function load() {
    const sb = supabase();
    const { data } = await sb
      .from("work_orders")
      .select("*, locations(name)")
      .eq("id", orderId)
      .eq("company_id", company.id)
      .single();
    if (!data) {
      router.replace(`/app/${company.id}/work-orders`);
      return;
    }
    // Employees may only view their own assigned orders (RLS enforces too).
    if (!isManager && data.assigned_to !== member.id) {
      router.replace(`/app/${company.id}/work-orders`);
      return;
    }
    setOrder(data);
    // Load comments with author names.
    const { data: cmts } = await sb
      .from("work_order_comments")
      .select("id, body, created_at, author_id, company_members!work_order_comments_author_id_fkey(name)")
      .eq("work_order_id", orderId)
      .order("created_at", { ascending: true });
    setComments(cmts || []);
    // Depth (D-WT-30): resolve the assignee's name the same way the
    // work orders list does, so every viewer who may see this order —
    // including the assigned employee — sees who it is assigned to.
    if (data.assigned_to) {
      const { data: assignees } = await sb.from("team_directory").select("id, display_name").eq("id", data.assigned_to);
      setAssigneeName(assignees && assignees[0] ? assignees[0].display_name || "" : "");
    } else {
      setAssigneeName("");
    }
    // Depth (D-WT-30): recorded events (status history + completion /
    // cancellation records, migration 085). Fail-soft: before the
    // migration runs this returns ok:false and the panels stay hidden,
    // leaving the page exactly as it was.
    const ev = await loadWorkOrderEvents(sb, orderId);
    setEvents(ev.events);
    setEventsOk(ev.ok);
    if (ev.ok && ev.events.length > 0) {
      const actorIds = [...new Set(ev.events.map((e) => e.actor_id).filter(Boolean))];
      if (actorIds.length > 0) {
        const { data: actors } = await sb.from("team_directory").select("id, display_name").in("id", actorIds);
        const byId = {};
        for (const a of actors || []) byId[a.id] = a.display_name;
        setActorNames(byId);
      }
    }
    if (isManager) {
      const { data: ms } = await sb.from("team_directory").select("id, display_name").eq("company_id", company.id).order("display_name");
      setMembers(ms || []);
    }
  }

  useEffect(() => {
    if (!loading && company && allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function update(patch) {
    if (!requireClockedIn(clockedIn, "update a work order")) return;
    const { error } = await supabase().from("work_orders").update(patch).eq("id", orderId);
    if (error) { alert("Could not update: " + error.message); return; }
    // Depth (D-WT-30): record the change in the append-only events
    // table (migration 085) — strictly AFTER the update above has
    // succeeded, best-effort, and never gating it. A status change
    // always lands a 'status' row; completing also stores the optional
    // sign-off name / completion note typed below, and cancelling the
    // optional reason. Empty optional text records nothing extra.
    if (patch.status && order && patch.status !== order.status) {
      const sb2 = supabase();
      const base = { orderId, companyId: company.id, actorId: member.id, fromStatus: order.status, toStatus: patch.status };
      await recordWorkOrderEvent(sb2, { ...base, eventType: "status" });
      if (patch.status === "completed") {
        const parts = [];
        if (signoffName.trim()) parts.push(`Signed off by ${signoffName.trim()}`);
        if (completionNote.trim()) parts.push(completionNote.trim());
        if (parts.length > 0) {
          await recordWorkOrderEvent(sb2, { ...base, eventType: "completion", detail: parts.join(" — ") });
          setSignoffName("");
          setCompletionNote("");
        }
      }
      if (patch.status === "cancelled" && cancelReason.trim()) {
        await recordWorkOrderEvent(sb2, { ...base, eventType: "cancellation", detail: cancelReason.trim() });
        setCancelReason("");
      }
    }
    // Fire notifications (best effort).
    try {
      if (patch.status === "completed") {
        await fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: orderId, event: "completed", actor_member_id: member.id }),
        });
      }
      if (patch.assigned_to) {
        await fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: orderId, event: "assigned", actor_member_id: member.id }),
        });
      }
    } catch {}
    load();
  }

  async function addComment(e) {
    e.preventDefault();
    if (!requireClockedIn(clockedIn, "post an update")) return;
    if (!newComment.trim()) return;
    setCommentSaving(true);
    const { error } = await supabase().from("work_order_comments").insert({
      work_order_id: orderId,
      company_id: company.id,
      author_id: member.id,
      body: newComment.trim(),
    });
    setCommentSaving(false);
    if (error) { alert("Could not add update: " + error.message); return; }
    setNewComment("");
    load();
  }

  async function deleteComment(id) {
    if (!confirm("Delete this update?")) return;
    const { error } = await supabase().from("work_order_comments").delete().eq("id", id);
    if (error) alert("Could not delete: " + error.message);
    else load();
  }

  async function deleteOrder() {    if (!confirm("Delete this work order?")) return;
    const { error } = await supabase().from("work_orders").delete().eq("id", orderId);
    if (error) alert("Could not delete: " + error.message);
    else router.replace(`/app/${company.id}/work-orders`);
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">WORK ORDERS</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Work orders</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Work orders are a <strong>Pro</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }
  if (!order) return <p>Loading…</p>;

  const canEdit = isManager || order.assigned_to === member.id;

  return (
    <div>
      <Link href={`/app/${company.id}/work-orders`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem" }}>
        ← All work orders
      </Link>
      <p className="eyebrow" style={{ marginTop: 12 }}>
        {STATUS_LABELS[order.status].toUpperCase()} • {PRIORITY_LABELS[order.priority].toUpperCase()} PRIORITY
        {order.source === "portal" ? " • 📩 CLIENT REQUEST" : ""}
      </p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{order.title}</h2>
      {order.agreed_price != null && (
        <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--brand-deep)", margin: "4px 0" }}>
          ${Number(order.agreed_price).toFixed(2)}
          <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--muted)" }}> agreed price</span>
        </p>
      )}
      <p style={{ color: "var(--muted)" }}>
        {order.locations?.name ? `${order.locations.name} • ` : ""}
        {order.due_date ? `Due ${order.due_date}` : "No due date"}
        {" • Assigned to "}
        {order.assigned_to ? assigneeName || "Assigned team member" : "Unassigned"}
      </p>
      {/* Status banner — makes progress visible */}
      <div style={{
        padding: "12px 16px",
        borderRadius: 12,
        margin: "12px 0",
        fontWeight: 700,
        fontSize: "0.95rem",
        background: order.status === "completed" ? "#e6f4ea" : order.status === "in_progress" ? "#e8f0fe" : order.status === "cancelled" ? "#fce8e6" : "#fef7e0",
        color: order.status === "completed" ? "#137333" : order.status === "in_progress" ? "#1a73e8" : order.status === "cancelled" ? "#a50e0e" : "#b06000",
        border: `1px solid ${order.status === "completed" ? "#a8dab5" : order.status === "in_progress" ? "#aecbfa" : order.status === "cancelled" ? "#f5c6c2" : "#fde68a"}`,
      }}>
        {order.status === "open" && "📋 Open — waiting to be started"}
        {order.status === "in_progress" && "🔧 In progress — work is underway"}
        {order.status === "completed" && `✅ Completed${order.completed_at ? ` on ${new Date(order.completed_at).toLocaleDateString()} at ${new Date(order.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`}
        {order.status === "cancelled" && "❌ Cancelled"}
      </div>
      {order.description && (
        <section className="panel" style={{ padding: 18, margin: "16px 0" }}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{order.description}</p>
        </section>
      )}

      {/* Work order record — stored facts only (D-WT-30) */}
      {(() => {
        const completion = latestCompletionRecord(events);
        const cancellation = latestCancellationRecord(events);
        return (
          <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
            <h3 style={{ marginTop: 0 }}>Work order record</h3>
            <div style={{ display: "grid", gap: 6, fontSize: "0.95rem" }}>
              <p style={{ margin: 0 }}>Status: <strong>{STATUS_LABELS[order.status]}</strong></p>
              <p style={{ margin: 0 }}>Priority: <strong>{PRIORITY_LABELS[order.priority]}</strong></p>
              <p style={{ margin: 0 }}>
                Assigned to: <strong>{order.assigned_to ? assigneeName || "Assigned team member" : "Unassigned"}</strong>
              </p>
              {order.locations?.name && (
                <p style={{ margin: 0 }}>Location: <strong>{order.locations.name}</strong></p>
              )}
              <p style={{ margin: 0 }}>Due: <strong>{order.due_date ? order.due_date : "No due date"}</strong></p>
              {order.agreed_price != null && (
                <p style={{ margin: 0 }}>Agreed price: <strong>${Number(order.agreed_price).toFixed(2)}</strong></p>
              )}
              {order.source === "portal" && (
                <p style={{ margin: 0 }}>Source: <strong>Client request</strong></p>
              )}
              {order.created_at && (
                <p style={{ margin: 0 }}>
                  Created: <strong>{new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                </p>
              )}
              {order.completed_at && (
                <p style={{ margin: 0 }}>
                  Completed: <strong>{new Date(order.completed_at).toLocaleDateString()} {new Date(order.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                </p>
              )}
            </div>
            {order.status === "completed" && completion && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Completion record</p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{completion.detail}</p>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Recorded {new Date(completion.created_at).toLocaleDateString()} {new Date(completion.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {completion.actor_id && actorNames[completion.actor_id] ? ` by ${actorNames[completion.actor_id]}` : ""}
                </p>
              </div>
            )}
            {order.status === "cancelled" && cancellation && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Cancellation reason</p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{cancellation.detail}</p>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Recorded {new Date(cancellation.created_at).toLocaleDateString()} {new Date(cancellation.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {cancellation.actor_id && actorNames[cancellation.actor_id] ? ` by ${actorNames[cancellation.actor_id]}` : ""}
                </p>
              </div>
            )}
            {eventsOk && events.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Status history</p>
                {events.filter((e) => e.event_type === "status").map((e) => (
                  <p key={e.id} style={{ margin: "0 0 4px", fontSize: "0.9rem", color: "var(--muted)" }}>
                    {STATUS_LABELS[e.from_status] || e.from_status || "—"} → {STATUS_LABELS[e.to_status] || e.to_status || "—"}
                    {" • "}
                    {new Date(e.created_at).toLocaleDateString()} {new Date(e.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {e.actor_id && actorNames[e.actor_id] ? ` • ${actorNames[e.actor_id]}` : ""}
                  </p>
                ))}
                {events.filter((e) => e.event_type === "status").length === 0 && (
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>No status changes recorded yet.</p>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {isManager&&<WorkOrderCustomerPublication
        orderId={order.id} companyId={company.id} canManage={isManager}/>}
      {/* Updates / comments */}
      <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
        <h3 style={{ marginTop: 0 }}>Updates</h3>
        {comments.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No updates yet — add one as work progresses.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <p style={{ margin: "0 0 4px", whiteSpace: "pre-wrap" }}>{c.body}</p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
              {c.company_members?.name || "Someone"} • {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {isManager && (
                <button onClick={() => deleteComment(c.id)}
                  style={{ marginLeft: 8, border: "none", background: "none", color: "#b3261e", cursor: "pointer", fontSize: "0.8rem" }}>
                  Delete
                </button>
              )}
            </p>
          </div>
        ))}
        <form onSubmit={addComment} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add an update — e.g. lobby done, moving to restrooms…"
            style={{ ...input, flex: 1 }}
          />
          <button type="submit" disabled={commentSaving || !newComment.trim()} style={button}>Post</button>
        </form>
      </section>

      {canEdit && (
        <section className="panel" style={{ padding: 22, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Update status</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(STATUS_LABELS).map((s) => (
              <button
                key={s}
                onClick={() =>
                  update({
                    status: s,
                    completed_at: s === "completed" ? new Date().toISOString() : null,
                  })
                }
                disabled={order.status === s}
                style={{
                  ...chip,
                  background: order.status === s ? "var(--brand)" : "#fff",
                  color: order.status === s ? "#fff" : "var(--ink)",
                  opacity: order.status === s ? 1 : 0.85,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Optional completion / cancellation record (D-WT-30).
              Purely additive: these fields are stored alongside a
              status change only when filled in. Leaving them blank
              changes nothing — the status buttons above work exactly
              as they always have. */}
          {order.status !== "completed" && (
            <div style={{ marginTop: 16, maxWidth: 420 }}>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Signed off by (optional — name of the person who accepted the finished work)
                <input
                  value={signoffName}
                  onChange={(e) => setSignoffName(e.target.value)}
                  placeholder="Customer sign-off name"
                  style={{ ...input, marginTop: 6 }}
                />
              </label>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)", display: "block", marginTop: 10 }}>
                Completion note (optional)
                <input
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  placeholder="What was done"
                  style={{ ...input, marginTop: 6 }}
                />
              </label>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "6px 0 0" }}>
                If you fill these in, they are saved with the record when you mark this order Completed.
              </p>
            </div>
          )}
          {order.status !== "cancelled" && (
            <div style={{ marginTop: 16, maxWidth: 420 }}>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Cancellation reason (optional)
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why this order is being cancelled"
                  style={{ ...input, marginTop: 6 }}
                />
              </label>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "6px 0 0" }}>
                If you fill this in, it is saved with the record when you mark this order Cancelled.
              </p>
            </div>
          )}

          {isManager && (
            <div style={{ marginTop: 16, maxWidth: 420 }}>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Assigned to
                <select
                  value={order.assigned_to || ""}
                  onChange={(e) => update({ assigned_to: e.target.value || null })}
                  style={{ ...input, marginTop: 6 }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: "0.9rem", color: "var(--muted)", display: "block", marginTop: 10 }}>
                Priority
                <select
                  value={order.priority}
                  onChange={(e) => update({ priority: e.target.value })}
                  style={{ ...input, marginTop: 6 }}
                >
                  {Object.keys(PRIORITY_LABELS).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </label>
              <button onClick={deleteOrder} style={{ ...dangerButton, marginTop: 16 }}>
                Delete work order
              </button>
            </div>
          )}
        </section>
      )}
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
  padding: "11px 20px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const chip = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "9px 18px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.9rem",
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
