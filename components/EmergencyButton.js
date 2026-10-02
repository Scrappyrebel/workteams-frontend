"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useCompany } from "../lib/company-context";

// Big red emergency button. Opens a sheet: pick who gets alerted (Owner or
// Managers & Supervisors), type what's wrong, send. The alert goes out as a
// push notification plus an in-app record.
export default function EmergencyButton({ compact = false }) {
  const { company, member } = useCompany();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState("owner");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!message.trim()) {
      alert("Tell them what's wrong first.");
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/emergency/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          companyId: company.id,
          audience,
          message: message.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Send failed");
      setOpen(false);
      setMessage("");
      alert(
        json.pushReady
          ? "🚨 Alert sent. They're being notified now."
          : "Alert saved in the app. Push notifications aren't set up yet — tell your manager to enable them in the app menu."
      );
    } catch (e) {
      alert("Could not send: " + e.message);
    }
    setSending(false);
  }

  if (!company || !member) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "#b3261e",
          color: "#fff",
          border: "none",
          borderRadius: compact ? 12 : 999,
          padding: compact ? "8px 14px" : "14px 30px",
          fontWeight: 800,
          fontSize: compact ? "0.9rem" : "1.05rem",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(179,38,30,.35)",
        }}
      >
        🚨 Emergency
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: 24,
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 6px", color: "#b3261e" }}>🚨 Send emergency alert</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 16px" }}>
              This buzzes their phone immediately, even with the app closed.
            </p>

            <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 8 }}>Who should get it?</div>
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {[
                { key: "owner", label: "The owner", desc: "Goes straight to the owner only" },
                { key: "leaders", label: "Managers & supervisors", desc: "Everyone who can respond and acknowledge" },
              ].map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAudience(a.key)}
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: audience === a.key ? "2px solid #b3261e" : "1px solid var(--line)",
                    background: audience === a.key ? "#fdf0ef" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{a.label}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{a.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 8 }}>What's wrong?</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Pipe burst at Stages, water everywhere — need help now"
              rows={3}
              maxLength={500}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                fontSize: "1rem",
                fontFamily: "inherit",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending}
                style={{
                  flex: 2,
                  padding: "14px",
                  borderRadius: 999,
                  border: "none",
                  background: "#b3261e",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {sending ? "Sending…" : "🚨 Send alert now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
