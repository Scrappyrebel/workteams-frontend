"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUseWithRole } from "../../../../lib/tiers";
import { roleRank } from "../../../../lib/roles";

export default function MessagesPage() {
  const { company, member, loading } = useCompany();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [receipts, setReceipts] = useState(null);
  const [roster, setRoster] = useState([]);
  const bottomRef = useRef(null);
  const lastMarkedRef = useRef(null);

  const allowed = canUseWithRole(company?.effectiveTier || company?.tier, "messaging", member?.role);

  async function load(scroll) {
    const sb = supabase();
    const { data } = await sb
      .from("messages")
      .select("id, content, created_at, sender_id")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true })
      .limit(200);
    const rows = data || [];
    const ids = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
    let names = {};
    if (ids.length > 0) {
      const { data: members } = await sb.from("team_directory").select("id, display_name").in("id", ids);
      for (const m of members || []) names[m.id] = m.display_name;
    }
    setMessages(rows.map((r) => ({ ...r, sender_name: names[r.sender_id] || "Unknown" })));
    if (scroll) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    markSeenThrough(rows);
    loadReceipts();
  }

  // Read receipts (migration 073): opening the chat records how far this
  // member has seen — the created_at of the newest message they actually
  // loaded. One watermark row per member, advanced only, always in a
  // try/catch: a receipt must never break reading or posting the chat,
  // and until migration 073 runs the table simply is not there and every
  // call below fails quietly.
  async function markSeenThrough(rows) {
    if (!member || !rows || rows.length === 0) return;
    const newest = rows[rows.length - 1]?.created_at;
    if (!newest) return;
    if (lastMarkedRef.current && Date.parse(lastMarkedRef.current) >= Date.parse(newest)) return;
    lastMarkedRef.current = newest;
    try {
      await supabase()
        .from("message_read_receipts")
        .upsert(
          {
            company_id: company.id,
            member_id: member.id,
            seen_through_at: newest,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,member_id" }
        );
    } catch {
      // Receipts are best-effort; the chat itself is what matters.
    }
  }

  async function loadReceipts() {
    const sb = supabase();
    try {
      const { data: marks } = await sb
        .from("message_read_receipts")
        .select("member_id, seen_through_at")
        .eq("company_id", company.id);
      if (marks) {
        const map = {};
        for (const r of marks) map[r.member_id] = r.seen_through_at;
        setReceipts(map);
        const mine = map[member.id];
        if (mine && (!lastMarkedRef.current || Date.parse(mine) > Date.parse(lastMarkedRef.current))) {
          lastMarkedRef.current = mine;
        }
      }
    } catch {
      // No receipts table yet (or a failed read): no seen-by UI, chat unchanged.
    }
    try {
      const { data: people } = await sb
        .from("team_directory")
        .select("id, display_name, role")
        .eq("company_id", company.id);
      if (people) setRoster(people);
    } catch {
      // Roster is only for the seen-by list; its failure changes nothing else.
    }
  }

  // Seen / not-yet-seen line for one message. Only the poster and managers
  // (owner/admin — roleRank >= 2) ever see it; the poster is never listed
  // as waiting on their own message.
  function seenLine(m) {
    if (!receipts || roster.length === 0) return null;
    const isPoster = m.sender_id === member.id;
    const isManager = roleRank(member.role) >= 2;
    if (!isPoster && !isManager) return null;
    const others = roster.filter((p) => p.id !== m.sender_id);
    if (others.length === 0) return null;
    const seenAt = (p) => receipts[p.id] && Date.parse(receipts[p.id]) >= Date.parse(m.created_at);
    const seenNames = others.filter(seenAt).map((p) => p.display_name || "Unknown");
    const waitingNames = others.filter((p) => !seenAt(p)).map((p) => p.display_name || "Unknown");
    if (seenNames.length === 0) return `Not seen yet: ${waitingNames.join(", ")}`;
    let line = `Seen by ${seenNames.join(", ")}`;
    if (waitingNames.length > 0) line += ` · Not yet: ${waitingNames.join(", ")}`;
    return line;
  }

  useEffect(() => {
    if (loading || !company || !allowed) return;
    load(true);
    const t = setInterval(() => load(false), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  // Best-effort phone push to the rest of the crew, honoring each member's
  // saved "messages" preference (migration 068). The message itself is
  // already saved before this runs; a failed notify never affects it.
  async function notify(messageId) {
    try {
      const { data: { session } } = await supabase().auth.getSession();
      await fetch("/api/messages/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ companyId: company.id, messageId }),
      });
    } catch {
      // Notifications are best-effort; the message itself is what matters.
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const { data: inserted, error } = await supabase().from("messages").insert({
      company_id: company.id,
      sender_id: member.id,
      content: text,
    }).select("id");
    setSending(false);
    if (error) alert("Could not send: " + error.message);
    else {
      setDraft("");
      load(true);
      const messageId = inserted?.[0]?.id;
      if (messageId) notify(messageId);
    }
  }

  if (loading || !company) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div>
        <p className="eyebrow">MESSAGES</p>
        <h2 style={{ fontSize: "1.8rem" }}>🔒 Crew messaging</h2>
        <section className="panel" style={{ padding: 22, marginTop: 18 }}>
          <p>Team chat is a <strong>Plus</strong> feature.</p>
          <Link href={`/app/${company.id}/plans`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
            See plans →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <p className="eyebrow">MESSAGES</p>
          <h2 style={{ fontSize: "1.8rem", margin: "4px 0" }}>Crew chat</h2>
        </div>
        <button onClick={() => load(true)} style={{ ...ghostButton, marginLeft: "auto" }}>
          ↻ Refresh
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          margin: "16px 0",
          maxHeight: "55vh",
          overflowY: "auto",
          padding: "4px 2px",
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No messages yet — say hello to the crew. 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === member.id;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: mine ? "var(--brand)" : "#fff",
                color: mine ? "#fff" : "var(--ink)",
                border: mine ? "none" : "1px solid var(--line)",
                borderRadius: 16,
                padding: "10px 14px",
              }}
            >
              {!mine && <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--brand-deep)" }}>{m.sender_name}</div>}
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
              <div style={{ fontSize: "0.7rem", opacity: 0.7, marginTop: 4 }}>
                {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
              </div>
              {seenLine(m) && (
                <div style={{ fontSize: "0.68rem", opacity: 0.75, marginTop: 2 }}>{seenLine(m)}</div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8, position: "sticky", bottom: 12 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the crew…"
          maxLength={1000}
          style={{ ...input, flex: 1 }}
        />
        <button type="submit" disabled={sending || !draft.trim()} style={sendButton}>
          {sending ? "…" : "Send"}
        </button>
      </form>
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

const sendButton = {
  padding: "12px 24px",
  borderRadius: 999,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
};

const ghostButton = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: 999,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "0.85rem",
};
