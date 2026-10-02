"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "../lib/session";
import { canUse, tierLabel } from "../lib/tiers";
import { isProductOwner } from "../lib/product";

const NAV = [
  { key: "dashboard", label: "Dashboard", href: (c) => `/app/${c}`, minRole: null },
  { key: "scheduling", label: "Schedule", href: (c) => `/app/${c}/schedule`, minRole: null },
  { key: "timeclock", label: "Time Clock", href: (c) => `/app/${c}/time`, minRole: null },
  { key: "payroll", label: "My Hours / Payroll", href: (c) => `/app/${c}/payroll`, minRole: null },
  { key: "locations", label: "Locations", href: (c) => `/app/${c}/locations`, minRole: "manager" },
  { key: "team", label: "Team", href: (c) => `/app/${c}/team`, minRole: null },
  { key: "inspections", label: "Inspections", href: (c) => `/app/${c}/inspections`, minRole: "manager" },
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
  { key: "training", label: "Training", href: (c) => `/app/${c}/training`, minRole: null },
  { key: "connections", label: "Connections", href: (c) => `/app/${c}/connections`, minRole: null },
];

function roleRank(role) {
  return { owner: 2, admin: 1, employee: 0 }[role] ?? 0;
}

export default function AppShell({ company, member, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    isProductOwner().then(setIsOwner);
  }, []);

  const companyId = company?.id;
  const tier = company?.effectiveTier || company?.tier || "starter";
  const role = member?.role || "employee";
  const isManager = roleRank(role) >= 1;

  const links = NAV.filter((item) => {
    if (item.minRole === "manager" && !isManager) return false;
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
          <nav
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
        )}
      </header>
      <main className="site-shell">{children}</main>
    </div>
  );
}
