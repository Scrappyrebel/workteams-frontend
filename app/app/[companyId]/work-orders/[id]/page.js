"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import { useCompany } from "../../../../../lib/company-context";
import { canUse } from "../../../../../lib/tiers";

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
  const [order, setOrder] = useState(null);
  const [members, setMembers] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const isManager = member && (member.role === "owner" || member.role === "admin");
  const allowed = canUse(company?.effectiveTier || company?.tier, "workorders");

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
    const { error } = await supabase().from("work_orders").update(patch).eq("id", orderId);
    if (error) { alert("Could not update: " + error.message); return; }
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
      </p>
      <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>{order.title}</h2>
      <p style={{ color: "var(--muted)" }}>
        {order.locations?.name ? `${order.locations.name} • ` : ""}
        {order.due_date ? `Due ${order.due_date}` : "No due date"}
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
