"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getUser, linkMemberOnSignIn } from "../../lib/session";
import { getLastPath } from "../../lib/last-path";
import { chicagoToday } from "../../lib/dates";

export default function CompaniesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [justJoined, setJustJoined] = useState(0);
  // Company ids (subset of memberships) where this person has a shift
  // today — see the badge lookup in the load effect below.
  const [shiftToday, setShiftToday] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      // If the app was launched from the home-screen icon, jump back to
      // where the user left off instead of starting over.
      const last = getLastPath();
      if (last) {
        router.replace(last);
        return;
      }
      const sb = supabase();
      const claimed = await linkMemberOnSignIn(sb, u);
      if (claimed > 0) setJustJoined(claimed);
      const { data } = await sb
        .from("company_members")
        .select("id, role, companies(id, name, tier)")
        .not("user_id", "is", null)
        .eq("user_id", u.id);
      setMemberships(data || []);
      // Wrong-company guardrail (2026-10-29): an employee signed in and
      // landed in the wrong company, where every screen honestly showed
      // an empty schedule and nothing said his shift lived in the other
      // company. Mark each company where this person has a shift TODAY
      // so the picker itself points at where their work is. One extra
      // read, fully tolerant: any problem and there are simply no
      // badges, exactly as before — the picker must never fail over it.
      try {
        const rows = data || [];
        const memberIds = rows.map((m) => m.id).filter(Boolean);
        if (memberIds.length > 0) {
          const { data: todays, error } = await sb
            .from("shifts")
            .select("member_id")
            .in("member_id", memberIds)
            .eq("shift_date", chicagoToday());
          if (!error && todays) {
            const hit = new Set(todays.map((s) => s.member_id));
            setShiftToday(
              new Set(
                rows
                  .filter((m) => hit.has(m.id))
                  .map((m) => m.companies?.id)
                  .filter(Boolean)
              )
            );
          }
        }
      } catch {
        // No badges — the picker renders exactly as it did before.
      }
      setLoading(false);
    })();
  }, [router]);

  async function createCompany(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const sb = supabase();
    const email = user.email.toLowerCase();
    const displayName = email.split("@")[0];
    const { data: company, error } = await sb
      .from("companies")
      .insert({ name: name.trim(), tier: "starter", created_by: user.id })
      // Explicit safe columns: Stripe IDs are hidden from browser-role
      // reads by column-level grants, so SELECT * would be denied.
      .select("id,name,tier,subscription_status,is_complimentary,created_at")
      .single();
    if (error) {
      alert("Could not create company: " + error.message);
      setCreating(false);
      return;
    }
    const { error: mErr } = await sb.from("company_members").insert({
      company_id: company.id,
      user_id: user.id,
      email,
      display_name: displayName,
      role: "owner",
    });
    setCreating(false);
    if (mErr) {
      alert("Company created but membership failed: " + mErr.message);
      return;
    }
    setName("");
    router.push(`/app/${company.id}`);
  }

  if (loading) return <main className="site-shell"><p>Loading…</p></main>;

  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 30 }}>
        <p className="eyebrow">YOUR COMPANIES</p>
        <h2>Where do you want to work today?</h2>
        {justJoined > 0 && (
          <p style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
            ✅ You've been added to the team! Pick your company below.
          </p>
        )}
        {memberships.length === 0 && (
          <p style={{ color: "var(--muted)" }}>
            You're not on any team yet. Create your first company below — or ask your
            manager to add you by email.
          </p>
        )}
        <div style={{ display: "grid", gap: 10, margin: "18px 0" }}>
          {memberships.map((m) => (
            <Link
              key={m.companies.id}
              href={`/app/${m.companies.id}`}
              className="portal-card"
              style={{ minHeight: 0, padding: "16px 20px" }}
            >
              <span className="card-kicker">{m.role} • {m.companies.tier}</span>
              <h2 style={{ fontSize: "1.2rem", margin: "6px 0" }}>{m.companies.name}</h2>
              {shiftToday.has(m.companies.id) && (
                <span
                  style={{
                    display: "inline-block",
                    background: "#e6f4ea",
                    color: "#1a7f37",
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    margin: "0 0 6px",
                  }}
                >
                  🕐 Shift today
                </span>
              )}
              <span className="card-link">Open →</span>
            </Link>
          ))}
        </div>
        <form onSubmit={createCompany}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
            Start a new company
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sparkle Clean Co."
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                fontSize: "1rem",
              }}
            />
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "12px 22px",
                borderRadius: 999,
                border: "none",
                background: "var(--brand)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 8 }}>
            New companies start on the Starter tier. You'll be the owner.
          </p>
        </form>
      </section>
    </main>
  );
}
