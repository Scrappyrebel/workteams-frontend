"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* Public sales page for Lilly B's Temp Cleaning Staffing (/temp) — restyled
   2026-10-20 to the same layout language as the WorkTeams landing (dark
   hero, dual phone mockups, badge strip, card grids, step strip, dark CTA
   band), executed in the temp service's OWN green palette, scoped to
   .wt2-t-site (see the wt2-t block in app/globals.css). Presentation only:
   every word of copy below is the page's existing copy, the module's own
   catalog text (supabase/048 lane catalog + the /temp/book form labels), or
   a plain description of an engagement type the booking form itself offers.
   Nothing is invented — no stats, counts, ratings, or guarantees. */

const SERVICES = [
  {
    key: "commercial",
    icon: "building",
    title: "Office & Commercial",
    text: "Temp cleaners for offices, retail, and facilities — one shift or nightly coverage when your crew is short.",
    from: 25,
  },
  {
    key: "residential",
    icon: "home",
    title: "Residential",
    text: "Extra hands for homes: deep cleans, move-outs, recurring help, or event turnover.",
    from: 25,
  },
  {
    key: "construction_cleanup",
    icon: "hardhat",
    title: "Construction Cleanup",
    text: "Post-construction dust, debris, and detail cleaning so new builds are move-in ready.",
    from: 30,
  },
  {
    key: "day_janitorial",
    icon: "factory",
    title: "Warehouse & Day Janitorial",
    text: "Ongoing daytime help for manufacturing, warehouses, and plants — scale up or down weekly.",
    from: 26,
  },
  {
    key: "move_in_out",
    icon: "box",
    title: "Move In / Move Out",
    text: "Fast, thorough turnover cleans between tenants — apartments, rentals, and homes.",
    from: 25,
  },
  {
    key: "event",
    icon: "calendar",
    title: "Event & One-Day",
    text: "Setup, teardown, and same-day cleanup crews for events, grand openings, and emergencies.",
    from: 26,
  },
];

/* The five staffing lanes, exactly as the module catalog names and describes
   them (supabase/048_temp_intake_multitype.sql); skills are each lane's own
   catalog skills. */
const LANES = [
  {
    key: "cleaning",
    icon: "sparkles",
    label: "Cleaning / Janitorial",
    desc: "Janitorial and cleaning temps for commercial, residential and specialty sites.",
    skills: "General cleaning · restrooms · floor care · window cleaning",
  },
  {
    key: "office",
    icon: "briefcase",
    label: "Office / Administrative",
    desc: "Admin, clerical and front-office temps.",
    skills: "Data entry · reception · filing · phones",
  },
  {
    key: "manufacturing",
    icon: "factory",
    label: "Manufacturing / Industrial",
    desc: "Industrial, warehouse and production temps.",
    skills: "Assembly · packaging · forklift certified · shipping & receiving",
  },
  {
    key: "hospitality",
    icon: "cloche",
    label: "Hospitality / Events",
    desc: "Event, food-service and guest-service temps.",
    skills: "Serving · housekeeping · front desk · banquet setup",
  },
  {
    key: "general_labor",
    icon: "hammer",
    label: "General Labor",
    desc: "Day labor, moving, outdoor and site-support temps.",
    skills: "Loading & unloading · moving help · landscaping · warehouse support",
  },
];

/* The three engagement types the booking form itself offers (labels from
   /temp/book). Descriptions reuse this page's own words. */
const ENGAGEMENTS = [
  {
    key: "temp",
    icon: "clock",
    name: "Temporary",
    tag: "Temp — fill a shift",
    text: "Temps stay on our payroll — pay, payroll taxes, and workers' comp are on us. You get one simple hourly bill, for one shift or ongoing coverage.",
    featured: false,
  },
  {
    key: "temp_to_hire",
    icon: "users",
    name: "Temp-to-hire",
    tag: "Temp-to-hire — try before you hire",
    text: "Your temp works on your site for 90 days. If they're a fit, hire them directly onto your payroll — no recruiter fees, no interview gamble.",
    featured: true,
  },
  {
    key: "direct_hire",
    icon: "userPlus",
    name: "Direct hire",
    tag: "Direct hire — recruit for us",
    text: "We recruit, screen, and background-check for the role — the person you pick joins your payroll from day one.",
    featured: false,
  },
];

const WHY_TEMPS = [
  {
    icon: "banknote",
    title: "No hiring costs",
    text: "No job ads, no interviews, no bad hires. We recruit, screen, and background-check every temp before they ever see your site.",
  },
  {
    icon: "report",
    title: "No payroll, no taxes, no workers' comp",
    text: "Every temp is our W-2 employee. We handle pay, payroll taxes, unemployment, and workers' comp. You get one simple hourly bill.",
  },
  {
    icon: "scale",
    title: "Scale up or down weekly",
    text: "Need five cleaners this week and two next week? Done. No layoffs, no unemployment claims, no guilt.",
  },
  {
    icon: "refresh",
    title: "No-shows get replaced",
    text: "If a temp doesn't show, we send a replacement. Your shift stays covered — that's our problem, not yours.",
  },
  {
    icon: "users",
    title: "Try before you hire",
    text: "Love your temp? Hire them directly after 90 days on the job. You've already seen them work — no interview gamble.",
  },
  {
    icon: "bolt",
    title: "Cleaners fast",
    text: "Short-staffed tomorrow? We staff daily and one-day jobs, not just long contracts. Tell us what you need and we move.",
  },
];

const FAQS = [
  {
    q: "How fast can I get cleaners?",
    a: "For most jobs in our service area we can staff within 24–48 hours. One-day and emergency jobs are our specialty — tell us what you need and we'll tell you straight if we can cover it.",
  },
  {
    q: "Is there a minimum?",
    a: "Yes — a 4-hour minimum per cleaner per shift. That keeps it worth the temp's drive and worth your while.",
  },
  {
    q: "Who handles payroll taxes and workers' comp?",
    a: "We do. Every temp is a W-2 employee of Lilly B's Temp Cleaning Staffing. Pay, payroll taxes, unemployment insurance, and workers' comp are all on us — you just pay the hourly bill rate.",
  },
  {
    q: "What if a temp doesn't show up or isn't a fit?",
    a: "Call us and we replace them. If someone isn't working out, we swap them — you never have to have the awkward conversation.",
  },
  {
    q: "Can I hire my temp permanently?",
    a: "Yes — that's the temp-to-hire track. After 90 days on your site (6 months for long-term placements), you can hire them directly onto your payroll.",
  },
  {
    q: "Where do you serve?",
    a: "Montgomery, Gasconade, Lincoln, Audrain, and Warren counties, plus St. Charles County and the Chesterfield area.",
  },
];

/* ---------- inline SVG icons (stroke style, inherit currentColor) ------- */
const Svg = ({ children, size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

const I = {
  sparkles: (
    <Svg>
      <path d="M11 4.5 12.7 9 17 10.7 12.7 12.4 11 17 9.3 12.4 5 10.7 9.3 9z" />
      <path d="M18.6 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Svg>
  ),
  building: (
    <Svg>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M3 21h18" />
    </Svg>
  ),
  home: (
    <Svg>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  ),
  hardhat: (
    <Svg>
      <path d="M5 16.5a7.5 7.5 0 0 1 5-7.3V6.5h4v2.7a7.5 7.5 0 0 1 5 7.3" />
      <path d="M3 16.5h18V20H3z" />
    </Svg>
  ),
  factory: (
    <Svg>
      <path d="M3 21V10l5.5 3.2V10L14 13.2V8h7v13" />
      <path d="M3 21h18" />
      <path d="M17.5 12.5h.01M17.5 16h.01" />
    </Svg>
  ),
  box: (
    <Svg>
      <path d="M21 16.5v-8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8.5v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </Svg>
  ),
  calendar: (
    <Svg>
      <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
    </Svg>
  ),
  briefcase: (
    <Svg>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M8.5 7.5v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1" />
      <path d="M3 12.5h18" />
    </Svg>
  ),
  cloche: (
    <Svg>
      <path d="M4 17.5a8 8 0 0 1 16 0" />
      <path d="M2.5 17.5h19M2.5 21h19" />
      <path d="M12 9.5v-1" />
      <circle cx="12" cy="7" r="1" />
    </Svg>
  ),
  hammer: (
    <Svg>
      <path d="M13.5 5.5 18 10l-2.3 2.3-4.5-4.5z" />
      <path d="M10.6 9.4 3.8 16.2a1.8 1.8 0 0 0 0 2.5l1.5 1.5a1.8 1.8 0 0 0 2.5 0l6.8-6.8" />
    </Svg>
  ),
  banknote: (
    <Svg>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.7" />
      <path d="M6.2 9.6h.01M17.8 14.4h.01" />
    </Svg>
  ),
  report: (
    <Svg>
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H8" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8.5 15.5v2M12 13v4.5M15.5 11v6.5" />
    </Svg>
  ),
  scale: (
    <Svg>
      <path d="M7 3.5v13M4 12.8l3 3.7 3-3.7" />
      <path d="M17 20.5v-13M14 11.2l3-3.7 3 3.7" />
    </Svg>
  ),
  refresh: (
    <Svg>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.8 2.8v4.4h-4.4" />
    </Svg>
  ),
  users: (
    <Svg>
      <path d="M16.5 20.5v-1.7a4.3 4.3 0 0 0-4.3-4.3H6a4.3 4.3 0 0 0-4.3 4.3v1.7" />
      <circle cx="9.1" cy="7.3" r="3.8" />
      <path d="M21.5 20.5v-1.7a4.3 4.3 0 0 0-3-4M15.5 3.7a3.8 3.8 0 0 1 0 7.2" />
    </Svg>
  ),
  bolt: (
    <Svg>
      <path d="M13 2.5 4.8 13.5H11L9.9 21.5 19.2 10H12.8z" />
    </Svg>
  ),
  clock: (
    <Svg>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7v5.2l3.4 2" />
    </Svg>
  ),
  userPlus: (
    <Svg>
      <circle cx="10" cy="7.8" r="3.7" />
      <path d="M3.5 20.5v-1.6a4.6 4.6 0 0 1 4.6-4.6h3.8a4.6 4.6 0 0 1 3.4 1.6" />
      <path d="M18.5 5v6.5M15.2 8.2h6.6" />
    </Svg>
  ),
  check: (
    <Svg size={18}>
      <path d="M20 6.5 9.2 17.5 4 12.3" />
    </Svg>
  ),
  checkCircle: (
    <Svg size={22}>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity=".16" />
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 12.4 11 15l4.6-4.9" />
    </Svg>
  ),
  arrow: (
    <Svg size={20}>
      <path d="M4.5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  pin: (
    <Svg size={20}>
      <path d="M12 21.5s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" />
      <circle cx="12" cy="10.5" r="2.6" />
    </Svg>
  ),
  clockPin: (
    <Svg>
      <path d="M12 21.5s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" />
      <path d="M12 7v3.4l2.3 1.6" />
    </Svg>
  ),
};

function WorthItCalculator({ rates }) {
  const [workers, setWorkers] = useState(2);
  const [hours, setHours] = useState(40);
  const [pay, setPay] = useState(17);
  const [jobType, setJobType] = useState("commercial");

  const calc = useMemo(() => {
    const w = Math.max(1, workers || 0);
    const h = Math.max(1, hours || 0);
    const p = Math.max(15, pay || 0);
    const directWeekly = w * h * p * 1.25; // pay + ~25% employer burden
    const billRate = Number(rates?.[jobType] ?? 25);
    const tempWeekly = w * h * billRate;
    const premium = tempWeekly - directWeekly;
    return { w, h, p, billRate, directWeekly, tempWeekly, premium };
  }, [workers, hours, pay, jobType, rates]);

  const fmt = (n) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="card" style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
      <h3 style={{ marginTop: 0 }}>Do the math yourself</h3>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Hiring direct looks cheaper per hour — until you add what it really
        costs to employ someone. Plug in your numbers:
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <label style={{ fontSize: 14 }}>
          Job type
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            style={inputStyle}
          >
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title} — ${Number(rates?.[s.key] ?? s.from)}/hr
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14 }}>
          Workers needed
          <input
            type="number"
            min={1}
            value={workers}
            onChange={(e) => setWorkers(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 14 }}>
          Hours / week each
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 14 }}>
          Hourly pay if you hired direct ($)
          <input
            type="number"
            min={15}
            value={pay}
            onChange={(e) => setPay(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <div style={resultBox}>
          <div style={resultLabel}>Hiring direct — true weekly cost</div>
          <div style={resultValue}>{fmt(calc.directWeekly)}</div>
          <div style={resultNote}>
            Pay + ~25% for payroll taxes, unemployment & workers&apos; comp — before
            recruiting costs and turnover.
          </div>
        </div>
        <div style={{ ...resultBox, borderColor: "var(--brand)" }}>
          <div style={resultLabel}>
            With our temps — weekly cost (${calc.billRate.toFixed(2)}/hr)
          </div>
          <div style={{ ...resultValue, color: "var(--brand-deep)" }}>
            {fmt(calc.tempWeekly)}
          </div>
          <div style={resultNote}>
            One hourly rate. We cover pay, taxes, comp, recruiting & replacements.
          </div>
        </div>
      </div>
      <p style={{ fontSize: 14, marginTop: 16, marginBottom: 0 }}>
        The difference: <strong>{fmt(calc.premium)}/week</strong> buys you zero
        recruiting, zero HR headaches, replacements for no-shows, and the
        freedom to scale up or down any week.{" "}
        <Link href="/temp/book" style={{ fontWeight: 700 }}>
          Get an exact quote →
        </Link>
      </p>
    </div>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 16,
};
const resultBox = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--bg)",
};
const resultLabel = { fontSize: 13, color: "var(--muted)", fontWeight: 600 };
const resultValue = { fontSize: 30, fontWeight: 800, margin: "6px 0" };
const resultNote = { fontSize: 13, color: "var(--muted)" };

/* Two stylized phones — a client staffing request with a temp matched, and
   the temp's shift offer. Illustrative UI built from divs; rows are generic
   (no customer names, no invented details). */
function HeroPhones() {
  return (
    <div className="wt2-t-phones" aria-hidden="true">
      <div className="wt2-t-phone wt2-t-phone-back">
        <div className="wt2-t-phone-head wt2-t-phone-head-brand">
          <strong>Staffing request</strong>
          <small>New · Client request</small>
        </div>
        <div className="wt2-t-req">
          <span className="wt2-t-req-dot wt2-t-dot-live" />
          <div className="wt2-t-req-body">
            <strong>Office clean — Downtown</strong>
            <p>Tomorrow · 8:00 AM–4:00 PM</p>
            <span className="wt2-t-pill wt2-t-pill-live">Cleaning / Janitorial</span>
          </div>
        </div>
        <div className="wt2-t-req">
          <span className="wt2-t-req-dot wt2-t-dot-next" />
          <div className="wt2-t-req-body">
            <strong>2 temps requested</strong>
            <p>Matching by skills &amp; availability — lane first</p>
            <span className="wt2-t-pill">Matching…</span>
          </div>
        </div>
        <div className="wt2-t-matched">
          <span className="wt2-t-matched-ic">{I.checkCircle}</span>
          <div className="wt2-t-req-body">
            <strong>Temp matched</strong>
            <p>Skills: office cleaning · floor care</p>
            <span className="wt2-t-pill wt2-t-pill-live">Shift offer sent</span>
          </div>
        </div>
        <p className="wt2-t-phone-link">View requests →</p>
      </div>
      <div className="wt2-t-phone wt2-t-phone-front">
        <div className="wt2-t-phone-head wt2-t-phone-head-brand wt2-t-phone-head-center">
          <span className="wt2-t-head-pin">{I.pin}</span>
          <strong>Shift Offer</strong>
        </div>
        <div className="wt2-t-offer-body">
          <p className="wt2-t-offer-job">Office clean — Downtown</p>
          <p className="wt2-t-offer-when">Tomorrow · 8:00 AM – 4:00 PM</p>
          <div className="wt2-t-map">
            <span className="wt2-t-map-park" />
            <span className="wt2-t-map-pin">{I.clockPin}</span>
          </div>
          <p className="wt2-t-offer-note">GPS clock-in at the job site</p>
          <div className="wt2-t-offer-btns">
            <div className="wt2-t-offer-accept">Accept</div>
            <div className="wt2-t-offer-decline">Decline</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HERO_POINTS = [
  "Background-checked temps",
  "4-hour minimum, no long contracts",
  "Temp-to-hire after 90 days",
];

const BADGES = [
  "We recruit, screen & background-check",
  "W-2 employees — payroll & comp on us",
  "No-shows get replaced",
  "Scale up or down weekly",
];

export default function TempLanding() {
  const [rates, setRates] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/temp/config");
        const j = await r.json();
        if (j.available && j.serviceRates) setRates(j.serviceRates);
      } catch {
        /* fall back to defaults baked into SERVICES */
      }
    })();
  }, []);

  const rateFor = (key, fallback) => Number(rates?.[key] ?? fallback);

  return (
    <main className="wt2-t-site">
      {/* NAV */}
      <header className="wt2-t-nav">
        <span className="wt2-t-nav-brand">
          <span className="wt2-t-mark" aria-hidden="true">LB</span>
          <span className="wt2-t-nav-name">
            Lilly B&apos;s
            <small>Temp Cleaning Staffing</small>
          </span>
        </span>
        <nav className="wt2-t-nav-links" aria-label="Page sections">
          <a href="#lanes">Lanes</a>
          <a href="#rates">Rates</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="wt2-t-nav-cta">
          <Link href="/temp/apply" className="wt2-t-btn wt2-t-btn-navghost">Apply as a temp</Link>
          <Link href="/temp/book" className="wt2-t-btn wt2-t-btn-primary">Get cleaners</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="wt2-t-hero">
        <div className="wt2-t-hero-inner">
          <div className="wt2-t-hero-copy">
            <p className="wt2-t-eyebrow-hero">Lilly B&apos;s Temp Cleaning Staffing</p>
            <h1>
              <span className="wt2-t-line">Your next cleaner</span>
              <span className="wt2-t-line">is already hired.</span>
              <span className="wt2-t-line wt2-t-grad">By us.</span>
            </h1>
            <p className="wt2-t-lede">
              We send background-checked temp cleaners to your site — offices,
              homes, construction sites, warehouses. One hourly rate covers their
              pay, taxes, and workers&apos; comp. You just point them at the dirt.
            </p>
            <div className="wt2-t-cta-row">
              <Link href="/temp/book" className="wt2-t-btn wt2-t-btn-primary wt2-t-btn-lg wt2-t-btn-glow">
                Get cleaners
              </Link>
              <a href="#worth-it" className="wt2-t-btn wt2-t-btn-hero-outline wt2-t-btn-lg">
                Is it worth it?
              </a>
            </div>
            <div className="wt2-t-hero-points">
              {HERO_POINTS.map((p) => (
                <span key={p} className="wt2-t-hero-point">
                  <span className="wt2-t-hero-point-ic">{I.check}</span>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <HeroPhones />
        </div>
      </section>

      {/* BADGE STRIP */}
      <section className="wt2-t-badges" aria-label="Highlights">
        <div className="wt2-t-badges-inner">
          {BADGES.map((b) => (
            <span key={b} className="wt2-t-badge">
              <span className="wt2-t-badge-ic">{I.checkCircle}</span>
              {b}
            </span>
          ))}
        </div>
      </section>

      {/* LANES */}
      <section id="lanes" className="wt2-t-section">
        <p className="wt2-t-eyebrow">Service lanes</p>
        <h2 className="wt2-t-h2">One roster, five kinds of work.</h2>
        <p className="wt2-t-section-sub">
          Every temp is matched lane-first — by the skills and availability on
          their profile. Tell us the lane and the job, and we take it from there.
        </p>
        <div className="wt2-t-feat-grid">
          {LANES.map((l) => (
            <article key={l.key} className="wt2-t-feat-card">
              <span className="wt2-t-feat-ic">{I[l.icon]}</span>
              <strong>{l.label}</strong>
              <p>{l.desc}</p>
              <p className="wt2-t-feat-skills">{l.skills}</p>
            </article>
          ))}
          <article className="wt2-t-feat-card wt2-t-feat-card-cta">
            <span className="wt2-t-feat-ic">{I.arrow}</span>
            <strong>Not sure which lane?</strong>
            <p>
              The request form starts with the kind of work — pick the closest
              fit and tell us the rest in the job details.
            </p>
            <Link href="/temp/book" className="wt2-t-card-link">
              Start a request {I.arrow}
            </Link>
          </article>
        </div>
      </section>

      {/* ENGAGEMENT OPTIONS */}
      <section id="engage" className="wt2-t-band">
        <div className="wt2-t-band-inner">
          <p className="wt2-t-eyebrow">Engagement options</p>
          <h2 className="wt2-t-h2">Three ways to staff a job.</h2>
          <div className="wt2-t-engage-grid">
            {ENGAGEMENTS.map((e) => (
              <article
                key={e.key}
                className={e.featured ? "wt2-t-engage wt2-t-engage-featured" : "wt2-t-engage"}
              >
                <span className="wt2-t-engage-ic">{I[e.icon]}</span>
                <h3>{e.name}</h3>
                <p className="wt2-t-engage-tag">{e.tag}</p>
                <p className="wt2-t-engage-text">{e.text}</p>
                <Link href="/temp/book" className="wt2-t-card-link">
                  Start a request {I.arrow}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WORTH-IT CALCULATOR */}
      <section id="worth-it" className="wt2-t-section">
        <p className="wt2-t-eyebrow">The math</p>
        <h2 className="wt2-t-h2-center">
          Temps cost more per hour. Here&apos;s why companies still choose them.
        </h2>
        <p className="wt2-t-section-sub wt2-t-section-sub-center">
          A direct hire at $17/hr really costs you ~$21/hr once payroll taxes,
          unemployment, and workers&apos; comp are in. Then add job ads,
          interviews, turnover, and the weeks a seat sits empty.
        </p>
        <div className="wt2-t-calc-wrap">
          <WorthItCalculator rates={rates} />
        </div>
      </section>

      {/* RATE CARD */}
      <section id="rates" className="wt2-t-band">
        <div className="wt2-t-band-inner">
          <p className="wt2-t-eyebrow">Rates</p>
          <h2 className="wt2-t-h2">Straightforward rates. No surprises.</h2>
          <p className="wt2-t-section-sub">
            Per cleaner, per hour. The rate depends on the job type — harder,
            skilled, or long-term work prices differently, and that&apos;s fair to
            everyone.
          </p>
          <div className="wt2-t-feat-grid">
            {SERVICES.map((s) => (
              <article key={s.key} className="wt2-t-feat-card">
                <span className="wt2-t-feat-ic">{I[s.icon]}</span>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
                <p className="wt2-t-rate-from">from ${rateFor(s.key, s.from)}/hr</p>
              </article>
            ))}
          </div>
          <p className="wt2-t-footnote">
            Final quote depends on cleaners needed, hours, schedule, and job
            details. Long-term and high-volume jobs earn lower rates —{" "}
            <Link href="/temp/book">get your exact price</Link>.
          </p>
        </div>
      </section>

      {/* WHY TEMPS */}
      <section id="why" className="wt2-t-section">
        <p className="wt2-t-eyebrow">Why temps</p>
        <h2 className="wt2-t-h2">Why companies staff with temps instead of hiring</h2>
        <div className="wt2-t-feat-grid">
          {WHY_TEMPS.map((w) => (
            <article key={w.title} className="wt2-t-feat-card">
              <span className="wt2-t-feat-ic">{I[w.icon]}</span>
              <strong>{w.title}</strong>
              <p>{w.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="wt2-t-band">
        <div className="wt2-t-band-inner">
          <p className="wt2-t-eyebrow">How it works</p>
          <h2 className="wt2-t-h2">How it works</h2>
          <ol className="wt2-t-steps">
            {[
              {
                t: "Tell us what you need",
                d: "How many cleaners, what kind of job, when and where. Get your price up front — per cleaner, per hour.",
              },
              {
                t: "We send the crew",
                d: "Background-checked temps arrive, clock in with GPS verification, and get to work under your direction.",
              },
              {
                t: "Pay only for hours worked",
                d: "One bill. No payroll, no taxes, no comp paperwork. Love your temp? Hire them after 90 days.",
              },
            ].map((s, i) => (
              <li key={s.t} className="wt2-t-step">
                <span className="wt2-t-step-badge">
                  <span className="wt2-t-step-ic">{[I.report, I.users, I.banknote][i]}</span>
                  <span className="wt2-t-step-num" aria-hidden="true">{i + 1}</span>
                </span>
                <strong>{s.t}</strong>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="wt2-t-steps-cta">
            <Link href="/temp/book" className="wt2-t-btn wt2-t-btn-primary wt2-t-btn-lg">
              Request cleaners
            </Link>
          </div>
        </div>
      </section>

      {/* TEMP TO HIRE */}
      <section className="wt2-t-darkband">
        <div className="wt2-t-darkband-inner">
          <span className="wt2-t-darkband-ic">{I.users}</span>
          <h2>Try them for 90 days. Then steal them.</h2>
          <p>
            Temp-to-hire is the closest thing to a working interview. Your temp
            works on your site, on your schedule, for 90 days — and if
            they&apos;re a fit, you hire them directly onto your payroll. No
            recruiter fees, no interview gamble. You&apos;ve already watched them
            work.
          </p>
          <Link href="/temp/book" className="wt2-t-btn wt2-t-btn-white wt2-t-btn-lg">
            Start temp-to-hire
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="wt2-t-section wt2-t-faq">
        <p className="wt2-t-eyebrow">Questions</p>
        <h2 className="wt2-t-h2">Questions companies ask us</h2>
        <div className="wt2-t-faq-list">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* WORKER CTA */}
      <section className="wt2-t-section wt2-t-worker">
        <div className="wt2-t-worker-card">
          <p className="wt2-t-eyebrow">For workers</p>
          <h2 className="wt2-t-h2">Looking for work?</h2>
          <p className="wt2-t-worker-copy">
            Join our temp crew — pick up shifts at offices, homes, construction
            sites, and warehouses across east-central Missouri. You&apos;re our
            W-2 employee: steady pay, workers&apos; comp, and a path to get hired
            on full-time.
          </p>
          <Link href="/temp/apply" className="wt2-t-btn wt2-t-btn-tier wt2-t-btn-lg">
            Apply as a temp
          </Link>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="wt2-t-final">
        <h2>Short-staffed? Let&apos;s fix that.</h2>
        <p>
          Tell us what you need — we&apos;ll price it by the cleaner, by the
          hour, and have a crew ready. No contracts to sign just to get a quote.
        </p>
        <Link href="/temp/book" className="wt2-t-btn wt2-t-btn-white wt2-t-btn-lg">
          Get my price
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="wt2-t-footer">
        <div className="wt2-t-footer-inner">
          <span className="wt2-t-nav-brand">
            <span className="wt2-t-mark" aria-hidden="true">LB</span>
            <span className="wt2-t-nav-name">
              Lilly B&apos;s
              <small>Temp Cleaning Staffing</small>
            </span>
          </span>
          <p>Temp staffing across east-central Missouri.</p>
          <span className="wt2-t-footer-links">
            <Link href="/temp/book">Get cleaners</Link>
            <Link href="/temp/apply">Apply as a temp</Link>
            <Link href="/">WorkTeams</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
