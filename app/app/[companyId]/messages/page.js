"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useCompany } from "../../../../lib/company-context";
import { canUse } from "../../../../lib/tiers";

export default function MessagesPage() {
  const { company, member, loading } = useCompany();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const allowed = canUse(company?.effectiveTier || company?.tier, "messaging");

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
      const { data: members } = await sb.from("company_members").select("id, display_name").in("id", ids);
      for (const m of members || []) names[m.id] = m.display_name;
    }
    setMessages(rows.map((r) => ({ ...r, sender_name: names[r.sender_id] || "Unknown" })));
    if (scroll) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  useEffect(() => {
    if (loading || !company || !allowed) return;
    load(true);
    const t = setInterval(() => load(false), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, company, allowed]);

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase().from("messages").insert({
      company_id: company.id,
      sender_id: member.id,
      content: text,
    });
    setSending(false);
    if (error) alert("Could not send: " + error.message);
    else {
      setDraft("");
      load(true);
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
