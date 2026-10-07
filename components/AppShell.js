"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "../lib/session";
import { canUse, tierLabel } from "../lib/tiers";
import { isProductOwner } from "../lib/product";
import { roleRank } from "../lib/roles";
import { ensurePush, enablePush } from "../lib/push-client";
import { supabase } from "../lib/supabase";

const NAV = [
  { key: "dashboard", label: "Dashboard", href: (c) => `/app/${c}`, minRole: null },
  { key: "scheduling", label: "Schedule", href: (c) => `/app/${c}/schedule`, minRole: null },
  { key: "timeclock", label: "Time Clock", href: (c) => `/app/${c}/time`, minRole: null },
  { key: "payroll", label: "My Hours / Payroll", href: (c) => `/app/${c}/payroll`, minRole: null },
  { key: "locations", label: "Locations", href: (c) => `/app/${c}/locations`, minRole: "supervisor" },
  { key: "team", label: "Team", href: (c) => `/app/${c}/team`, minRole: null },
  { key: "inspections", label: "Inspections", href: (c) => `/app/${c}/inspections`, minRole: "supervisor" },
  { key: "shiftvideos", label: "🎬 Shift Videos", href: (c) => `/app/${c}/shift-videos`, minRole: "manager" },
  { key: "commbook", label: "📖 Comm Book", href: (c) => `/app/${c}/comm-book`, minRole: "manager" },
  { key: "messaging", label: "Messages", href: (c) => `/app/${c}/messages`, minRole: null },
  { key: "bidding", label: "Bids", href: (c) => `/app/${c}/bids`, minRole: "manager" },
  { key: "walkthroughs", label: "Walkthroughs", href: (c) => `/app/${c}/walkthroughs`, minRole: "manager" },
  { key: "workorders", label: "Work Orders", href: (c) => `/app/${c}/work-orders`, minRole: null },
  { key: "supplies", label: "Supplies", href: (c) => `/app/${c}/supplies`, minRole: "manager" },
  { key: "portal", label: "Client Portal", href: (c) => `/app/${c}/client-portal`, minRole: "manager" },
  { key: "profitability", label: "Profitability", href: (c) => `/app/${c}/profitability`, minRole: "manager" },
  { key: "plans", label: "Plans", href: (c) => `/app/${c}/plans`, minRole: null },
  { key: "contracts", label: "Contracts", href: (c) => `/app/${c}/contracts`, minRole: "manager" },
  { key: "tierprices", label: "Tier Prices", href: (c) => `/app/${c}/tier-prices`, minRole: null, productOwnerOnly: true },
  { key: "sales", label: "Sales", href: (c) => `/app/${c}/sales`, minRole: null, productOwnerOnly: true },
  { key: "training", label: "Training", href: (c) => `/app/${c}/training`, minRole: null },
  { key: "connections", label: "Connections", href: (c) => `/app/${c}/connections`, minRole: null },
  { key: "notifications", label: "🔔 Notifications", href: (c) => `/app/${c}/notifications`, minRole: null },
  { key: "emergency", label: "🚨 Alerts", href: (c) => `/app/${c}/emergency`, minRole: null },
];

function roleAtLeast(role, level) {
  return roleRank(role) >= roleRank(level);
}

export default function AppShell({ company, member, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);
  const [pushStatus, setPushStatus] = useState("unknown");
  const [unacked, setUnacked] = useState(0);

  useEffect(() => {
    isProductOwner().then(setIsOwner);
  }, []);

  // Set up push notifications for emergency alerts (once per session).
  useEffect(() => {
    if (!company?.id || !member?.id) return;
    ensurePush({
      companyId: company.id,
      getSession: () => supabase().auth.getSession(),
      onStatus: setPushStatus,
    });
  }, [company?.id, member?.id]);

  // Poll for unacknowledged alerts aimed at this viewer (leaders only —
  // they're the ones who respond).
  useEffect(() => {
    if (!company?.id || !member?.role) return;
    if (roleRank(member.role) < 1) return;
    let stop = false;
    async function check() {
      const audiences = ["leaders"];
      if (member.role === "owner") audiences.push("owner");
      const { count } = await supabase()
        .from("emergency_alerts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .in("audience", audiences)
        .is("acknowledged_at", null);
      if (!stop) setUnacked(count || 0);
    }
    check();
    const t = setInterval(check, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [company?.id, member?.role]);

  const companyId = company?.id;
  const tier = company?.effectiveTier || company?.tier || "starter";
  const role = member?.role || "employee";

  // Tab-bar scroll cue: shows a "more" arrow at the right edge while there
  // are hidden tabs to the right. Tapping it scrolls the bar over.
  // (Declared after companyId — the effect's dependency array reads it.)
  const navRef = useRef(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      setShowMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const t = setTimeout(update, 300);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      clearTimeout(t);
    };
  }, [companyId]);

  const links = NAV.filter((item) => {
    if (item.minRole && !roleAtLeast(role, item.minRole)) return false;
    if (item.productOwnerOnly && !isOwner) return false;
    return true;
  }).map((item) => {
    const allowed = canUse(tier, item.key);
    return {
      ...item,
      allowed,
      href: allowed ? item.href(companyId) : `/app/${companyId}/plans`,
    };
  });

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.96)",
          borderBottom: "1px solid var(--line)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div
          className="site-shell"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="brand-mark" style={{ width: 40, height: 40, flexBasis: 40, borderRadius: 12, fontSize: "0.95rem" }}>
              WT
            </span>
            <strong>WorkTeams</strong>
          </Link>
          {company && (
            <>
              <Link href="/app" style={{ fontSize: "0.85rem", color: "var(--brand-deep)", fontWeight: 700 }}>
                ← Companies
              </Link>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: "var(--brand-soft)",
                  color: "var(--brand-deep)",
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                {tierLabel(tier)} • {company.name}
              </span>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--muted)" }}>{member?.display_name || ""}</span>
          {pushStatus !== "on" && pushStatus !== "unknown" && pushStatus !== "unsupported" && (
            <button
              onClick={() => enablePush({
                companyId,
                getSession: () => supabase().auth.getSession(),
                onStatus: setPushStatus,
              })}
              title={pushStatus === "blocked" ? "Notifications are blocked — allow them in your browser settings" : "Turn on WorkTeams notifications"}
              style={{
                border: "1px solid #b3261e",
                background: "#fdf0ef",
                color: "#b3261e",
                borderRadius: 999,
                padding: "7px 14px",
                fontWeight: 800,
                fontSize: "0.82rem",
                cursor: pushStatus === "blocked" ? "default" : "pointer",
              }}
            >
              🔔 {pushStatus === "blocked" ? "Notifications blocked" : "Enable notifications"}
            </button>
          )}
          <button
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            style={{
              border: "1px solid var(--line)",
              background: "#fff",
              borderRadius: 999,
              padding: "7px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
        {companyId && (
          <div style={{ position: "relative" }}>
          <nav
            ref={navRef}
            className="site-shell"
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingTop: 0,
              paddingBottom: 10,
            }}
          >
            {links.map((item) => {
              const active = pathname === item.href || (item.key === "dashboard" && pathname === `/app/${companyId}`);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  style={{
                    whiteSpace: "nowrap",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    padding: "8px 13px",
                    borderRadius: 999,
                    background: active ? "var(--brand)" : "transparent",
                    color: active ? "#fff" : "var(--ink)",
                  }}
                >
                  {!item.allowed && "🔒 "}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {showMore && (
            <button
              aria-label="More tabs — scroll right"
              onClick={() => navRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
              style={{
                position: "absolute",
                right: 2,
                top: "50%",
                transform: "translateY(-60%)",
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "none",
                background: "var(--brand)",
                color: "#fff",
                fontSize: "1.2rem",
                fontWeight: 800,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              ›
            </button>
          )}
          </div>
        )}
      </header>
      {unacked > 0 && (
        <Link
          href={`/app/${companyId}/emergency`}
          style={{
            display: "block",
            background: "#b3261e",
            color: "#fff",
            textAlign: "center",
            fontWeight: 800,
            padding: "10px 16px",
            textDecoration: "none",
          }}
        >
          🚨 {unacked} emergency alert{unacked === 1 ? "" : "s"} need{unacked === 1 ? "s" : ""} a response — tap to view
        </Link>
      )}
      <main className="site-shell">{children}</main>
    </div>
  );
}
