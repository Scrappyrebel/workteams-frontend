"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearLastPath } from "../lib/last-path";
import { signOut } from "../lib/session";
import { canUseWithRole, planDisplayName } from "../lib/tiers";
import { isProductOwner } from "../lib/product";
import { roleRank } from "../lib/roles";
import { ensurePush, enablePush } from "../lib/push-client";
import { supabase } from "../lib/supabase";

const NAV = [
  { key: "timeclock", label: "Time Clock", href: (c) => `/app/${c}/time`, minRole: null },
  { key: "myschedule", label: "My Schedule", href: (c) => `/app/${c}/my-schedule`, minRole: null },
  // Dashboard is the THIRD tab and Schedule sits on the other side of
  // it (Wendy, WorkTeams walkthrough, 2026-11-19) — this supersedes the
  // earlier Time Clock / Schedule / My Schedule / Dashboard front order.
  { key: "dashboard", label: "Dashboard", href: (c) => `/app/${c}`, minRole: null },
  { key: "scheduling", label: "Schedule", href: (c) => `/app/${c}/schedule`, minRole: null },
  // Emergency Alerts rides up front, right behind the pinned core
  // (Wendy, 2026-11-16): alerts should not sit at the end of the strip.
  { key: "emergency", label: "🚨 Emergency Alerts", href: (c) => `/app/${c}/emergency`, minRole: null },
  { key: "payroll", label: "My Hours / Payroll", href: (c) => `/app/${c}/payroll`, minRole: null },
  { key: "locations", label: "Locations", href: (c) => `/app/${c}/locations`, minRole: "supervisor" },
  { key: "team", label: "Team", href: (c) => `/app/${c}/team`, minRole: null },
  { key: "inspections", label: "Inspections", href: (c) => `/app/${c}/inspections`, minRole: "supervisor" },
  { key: "shiftvideos", label: "🎬 Shift Videos", href: (c) => `/app/${c}/shift-videos`, minRole: "manager", featureFlag: "enable_shift_videos" },
  { key: "commbook", label: "📖 Comm Book", href: (c) => `/app/${c}/comm-book`, minRole: null, featureFlag: "enable_comm_book" },
  { key: "messaging", label: "Messages", href: (c) => `/app/${c}/messages`, minRole: null },
  // Sales department (Wendy, WorkTeams walkthrough, 2026-11-19): the
  // whole selling chain -- Walkthroughs, Bids, Contracts -- sits
  // together under one "Sales Department" heading in the menu panel,
  // anchored where Walkthroughs already was (the 2026-11-03 grouping,
  // renamed to a real department at the walkthrough). The three items
  // keep their labels, hrefs and role gates.
  { key: "walkthroughs", label: "Walkthroughs", href: (c) => `/app/${c}/walkthroughs`, minRole: "manager" },
  { key: "bidding", label: "Bids", href: (c) => `/app/${c}/bids`, minRole: "manager" },
  { key: "contracts", label: "Contracts", href: (c) => `/app/${c}/contracts`, minRole: "manager" },
  { key: "workorders", label: "Work Orders", href: (c) => `/app/${c}/work-orders`, minRole: null },
  // Renamed "Inventory" (Wendy, WorkTeams walkthrough, 2026-11-19):
  // the supplies-inventory page stands on its own under this name.
  // Key, href and role gate unchanged.
  { key: "supplies", label: "Inventory", href: (c) => `/app/${c}/supplies`, minRole: null },
  // Documents & Forms (D-WT-58, decided 2026-11-06): the company
  // document library + built-in starter forms. Additive entry — no
  // existing item moved or renamed. The section itself applies the
  // per-document audience floors (lib/documents/library).
  { key: "documents", label: "Documents & Forms", href: (c) => `/app/${c}/documents`, minRole: null },
  { key: "portal", label: "Client Portal", href: (c) => `/app/${c}/client-portal`, minRole: "manager" },
  { key: "profitability", label: "Profitability", href: (c) => `/app/${c}/profitability`, minRole: "manager" },
  { key: "invoices", label: "Invoices", href: (c) => `/app/${c}/invoices`, minRole: "manager" },
  { key: "locationmoney", label: "Money by Location", href: (c) => `/app/${c}/location-money`, minRole: "manager" },
  { key: "training", label: "Training", href: (c) => `/app/${c}/training`, minRole: null },
  { key: "connections", label: "Connections", href: (c) => `/app/${c}/connections`, minRole: null },
  { key: "notifications", label: "🔔 Notifications", href: (c) => `/app/${c}/notifications`, minRole: null },
  // End-of-strip group (Wendy, WorkTeams walkthrough, 2026-11-19):
  // Temp Staffing (inserted at runtime, below) -> Settings -> App Sales
  // -> Tier Prices -> Plans, with Plans LAST of all. "Sales" is renamed
  // "App Sales" because this dashboard is the app's subscription
  // revenue, not the cleaning business's selling (that is the Sales
  // department: Walkthroughs, Bids, Contracts).
  { key: "settings", label: "Settings", href: (c) => `/app/${c}/settings`, minRole: "owner" },
  { key: "sales", label: "App Sales", href: (c) => `/app/${c}/sales`, minRole: null, productOwnerOnly: true },
  { key: "tierprices", label: "Tier Prices", href: (c) => `/app/${c}/tier-prices`, minRole: null, productOwnerOnly: true },
  { key: "plans", label: "Plans", href: (c) => `/app/${c}/plans`, minRole: null },
];

// Word-tolerant menu search matching (Wendy, 2026-11-03): the plain
// plural words an owner types -- "Clients", "Invoices" -- must find the
// nav's singular labels ("Client Portal"). A label matches when it
// contains the query as typed, or the query with a trailing plural
// ending stripped word by word ("ies" -> "y", "es" after ss/x/z/ch/sh,
// or a plain trailing "s"). The item list, its order, and who can see
// each item are unchanged.
function navQueryVariants(query) {
  const singular = (word) => {
    if (word.length > 3 && word.endsWith("ies")) return word.slice(0, -3) + "y";
    if (word.length > 4 && /(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
    if (word.length > 1 && word.endsWith("s")) return word.slice(0, -1);
    return word;
  };
  const variants = new Set([query]);
  const perWord = query.split(/\s+/).map(singular).join(" ");
  if (perWord.length >= 3) variants.add(perWord);
  return [...variants];
}

function navLabelMatches(label, query) {
  const text = label.toLowerCase();
  return navQueryVariants(query).some((variant) => text.includes(variant));
}

function roleAtLeast(role, level) {
  return roleRank(role) >= roleRank(level);
}

export default function AppShell({ company, member, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);
  const [pushStatus, setPushStatus] = useState("unknown");
  const [unacked, setUnacked] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const menuRef = useRef(null);
  // Temp staffing module: only the temp agency company gets the tab.
  // Everyone else never sees it (gated second-company feature).
  const [isTempAgency, setIsTempAgency] = useState(false);

  useEffect(() => {
    isProductOwner().then(setIsOwner);
  }, []);

  useEffect(() => {
    if (!company?.id) return;
    let stop = false;
    (async () => {
      try {
        const { data: session } = await supabase().auth.getSession();
        const token = session?.session?.access_token;
        const r = await fetch(`/api/temp/agency?companyId=${company.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json();
        if (!stop) setIsTempAgency(!!j.isAgency);
      } catch {
        if (!stop) setIsTempAgency(false);
      }
    })();
    return () => { stop = true; };
  }, [company?.id]);

  // Temp-agency entry warning (Wendy, 2026-11-19): people who belong to
  // more than one company kept opening the temp agency company by mistake
  // and clocking in there. Entering the temp agency now stops them with a
  // full-screen acknowledgment — nothing works until they tap that they
  // understand this is the temp agency. Only the temp agency company shows
  // it (never a regular company), and only for people with 2+ companies:
  // a temp-only person has nothing to mix it up with and never sees it.
  const [myCompanyCount, setMyCompanyCount] = useState(null);
  const [tempAckedFor, setTempAckedFor] = useState(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const { data: session } = await supabase().auth.getSession();
        const uid = session?.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase()
          .from("company_members")
          .select("company_id")
          .not("user_id", "is", null)
          .eq("user_id", uid);
        if (!stop && data) {
          setMyCompanyCount(new Set(data.map((r) => r.company_id)).size);
        }
      } catch {
        // Count unknown: the warning simply doesn't arm. Never block
        // anyone out of their own app over a failed count.
      }
    })();
    return () => { stop = true; };
  }, []);

  // Leaving the temp agency re-arms the warning, so coming back in —
  // or reopening the app while it sits in the temp agency — shows it again.
  useEffect(() => {
    setTempAckedFor((prev) => (prev === company?.id ? prev : null));
  }, [company?.id]);

  const showTempWarning =
    isTempAgency &&
    myCompanyCount !== null &&
    myCompanyCount >= 2 &&
    tempAckedFor !== company?.id;

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
    if (item.featureFlag && company && company[item.featureFlag] === false) return false;
    return true;
  });
  // Temp staffing tab: managers and up, for enabled companies — plus the
  // product owner always, so the per-company enable button is reachable.
  // It leads the end-of-strip group (Wendy, WorkTeams walkthrough,
  // 2026-11-19 — reversing its 2026-11-16 front placement): Temp
  // Staffing -> Settings -> App Sales -> Tier Prices -> Plans, so it
  // never sits mixed in with a regular company's own pages.
  if ((isTempAgency || isOwner) && roleAtLeast(role, "manager")) {
    const tempItem = {
      key: "tempstaffing",
      label: "🧹 Temp Staffing",
      href: (c) => `/app/${c}/temp`,
    };
    const endIdx = links.findIndex((l) =>
      ["settings", "sales", "tierprices", "plans"].includes(l.key)
    );
    if (endIdx >= 0) links.splice(endIdx, 0, tempItem);
    else links.push(tempItem);
  }
  const linksMapped = links.map((item) => {
    // Tier locks apply to everyone alike (audit §6, 2026-11-15):
    // the menu uses the same gate as the pages, so a feature the
    // company's tier does not include shows as locked here instead
    // of opening an empty page the database will not serve.
    const allowed = canUseWithRole(tier, item.key, role);
    return {
      ...item,
      allowed,
      href: allowed ? item.href(companyId) : `/app/${companyId}/plans`,
    };
  });

  // Menu search (Wendy, 2026-11-01): filters the SAME permission-filtered
  // list above, so a search can never surface an item the viewer couldn't
  // already see. Matching is word-tolerant (2026-11-03): a plural query
  // also matches singular labels, so "Clients" finds "Client Portal".
  // The nav order itself is unchanged. null = no search term
  // (panel shows the full nav, exactly as usual).
  const navQuery = navSearch.trim().toLowerCase();
  let navResults = null;
  if (navQuery) {
    const seen = new Set();
    navResults = linksMapped.filter((item) => {
      if (!navLabelMatches(item.label, navQuery)) return false;
      const dedupeKey = `${item.label}|${item.href}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }
  const panelItems = navResults ?? linksMapped;

  // Hamburger menu: closes on route change, Escape, or an outside tap.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // A fresh menu open starts with an empty search box.
  useEffect(() => {
    if (!menuOpen) setNavSearch("");
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

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
            flexWrap: "wrap",
            gap: 12,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          {companyId && (
            <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu — all tools"}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  border: "1px solid var(--line)",
                  background: menuOpen ? "var(--brand-soft)" : "#fff",
                  color: "var(--brand-deep)",
                  borderRadius: 999,
                  padding: "8px 16px 8px 13px",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: "1.15rem", lineHeight: 1 }}>☰</span>
                Menu
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="All sections and tools"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    left: 0,
                    width: "min(92vw, 340px)",
                    maxHeight: "72vh",
                    overflowY: "auto",
                    background: "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: 16,
                    boxShadow: "0 18px 44px rgba(24,34,53,0.28)",
                    padding: 8,
                    zIndex: 80,
                  }}
                >
                  <p
                    style={{
                      margin: "6px 12px 8px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      color: "var(--muted)",
                    }}
                  >
                    ALL SECTIONS &amp; TOOLS
                  </p>
                  <input
                    type="search"
                    value={navSearch}
                    onChange={(e) => setNavSearch(e.target.value)}
                    placeholder="Search sections & tools…"
                    aria-label="Search sections and tools"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 44,
                      margin: "0 0 6px",
                      padding: "10px 14px",
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      fontSize: "1rem",
                      color: "var(--ink)",
                      background: "#fff",
                    }}
                  />
                  {navResults !== null && navResults.length === 0 && (
                    <p
                      style={{
                        margin: "6px 12px 10px",
                        fontSize: "0.9rem",
                        color: "var(--muted)",
                      }}
                    >
                      No matches
                    </p>
                  )}
                  {panelItems.map((item) => {
                    const active = pathname === item.href || (item.key === "dashboard" && pathname === `/app/${companyId}`);
                    const link = (
                      <Link
                        key={item.key}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          minHeight: 52,
                          padding: "12px 14px",
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: "1rem",
                          color: active ? "#fff" : "var(--ink)",
                          background: active ? "var(--brand)" : "transparent",
                        }}
                      >
                        {!item.allowed && "🔒 "}
                        {item.label}
                      </Link>
                    );
                    // Department headings (Wendy, WorkTeams walkthrough,
                    // 2026-11-19): presentational only -- a heading is not
                    // a link and never a search result, so headings render
                    // only over the full (unsearched) panel. "SALES
                    // DEPARTMENT" sits directly above Walkthroughs (the
                    // selling chain -- Walkthroughs, Bids, Contracts --
                    // all manager-gated, so the heading appears exactly
                    // when they do; this renames the 2026-11-03
                    // "Walkthrough and Bidding" grouping into the Sales
                    // department Wendy asked for). "CUSTOMER SERVICE
                    // DEPARTMENT" sits directly above Client Portal --
                    // that page carries the customer service inbox too,
                    // so the portal item is the department's door.
                    if (navResults === null && item.key === "walkthroughs") {
                      return [
                        <p
                          key="sales-department-heading"
                          aria-hidden="true"
                          style={{
                            margin: "10px 12px 2px",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            color: "var(--muted)",
                          }}
                        >
                          SALES DEPARTMENT
                        </p>,
                        link,
                      ];
                    }
                    if (navResults === null && item.key === "portal") {
                      return [
                        <p
                          key="customer-service-department-heading"
                          aria-hidden="true"
                          style={{
                            margin: "10px 12px 2px",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            color: "var(--muted)",
                          }}
                        >
                          CUSTOMER SERVICE DEPARTMENT
                        </p>,
                        link,
                      ];
                    }
                    return link;
                  })}
                </div>
              )}
            </div>
          )}
          <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="brand-mark" style={{ width: 40, height: 40, flexBasis: 40, borderRadius: 12, fontSize: "0.95rem" }}>
              WT
            </span>
            <strong>WorkTeams</strong>
          </Link>
          {company && (
            <>
              <Link
                href="/app"
                onClick={() => clearLastPath()}
                style={{ fontSize: "0.85rem", color: "var(--brand-deep)", fontWeight: 700 }}
              >
                ← Companies
              </Link>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  background: isTempAgency ? "#fef3c7" : "var(--brand-soft)",
                  color: isTempAgency ? "#92400e" : "var(--brand-deep)",
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                {isTempAgency ? "🧹 " : ""}
                {planDisplayName(company)} • {company.name}
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
            {linksMapped.map((item) => {
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
      {showTempWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="You are entering the temp agency company"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(24,34,53,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fffbeb",
              border: "2px solid #f59e0b",
              borderRadius: 20,
              maxWidth: 440,
              width: "100%",
              padding: "28px 24px",
              textAlign: "center",
              boxShadow: "0 24px 60px rgba(24,34,53,0.4)",
            }}
          >
            <div style={{ fontSize: "2.4rem", lineHeight: 1 }} aria-hidden="true">⚠️</div>
            <h2 style={{ margin: "12px 0 8px", fontSize: "1.35rem", color: "#92400e" }}>
              You&rsquo;re entering the TEMP AGENCY
            </h2>
            <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: "1.05rem" }}>
              {company?.name}
            </p>
            <p style={{ margin: "0 0 20px", color: "var(--ink)", lineHeight: 1.5 }}>
              This is the temp agency company — <strong>not</strong> your regular
              company. Clock-ins and work done here go to the temp agency.
            </p>
            <button
              type="button"
              onClick={() => setTempAckedFor(company.id)}
              style={{
                width: "100%",
                minHeight: 52,
                border: "none",
                borderRadius: 999,
                background: "#f59e0b",
                color: "#451a03",
                fontWeight: 800,
                fontSize: "1rem",
                cursor: "pointer",
                padding: "12px 20px",
              }}
            >
              I understand — this is the temp agency
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
