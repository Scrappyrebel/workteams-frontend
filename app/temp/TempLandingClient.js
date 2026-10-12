"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const SERVICES = [
  {
    key: "commercial",
    icon: "🏢",
    title: "Office & Commercial",
    text: "Temp cleaners for offices, retail, and facilities — one shift or nightly coverage when your crew is short.",
    from: 25,
  },
  {
    key: "residential",
    icon: "🏠",
    title: "Residential",
    text: "Extra hands for homes: deep cleans, move-outs, recurring help, or event turnover.",
    from: 25,
  },
  {
    key: "construction_cleanup",
    icon: "🏗️",
    title: "Construction Cleanup",
    text: "Post-construction dust, debris, and detail cleaning so new builds are move-in ready.",
    from: 30,
  },
  {
    key: "day_janitorial",
    icon: "🏭",
    title: "Warehouse & Day Janitorial",
    text: "Ongoing daytime help for manufacturing, warehouses, and plants — scale up or down weekly.",
    from: 26,
  },
  {
    key: "move_in_out",
    icon: "📦",
    title: "Move In / Move Out",
    text: "Fast, thorough turnover cleans between tenants — apartments, rentals, and homes.",
    from: 25,
  },
  {
    key: "event",
    icon: "🎉",
    title: "Event & One-Day",
    text: "Setup, teardown, and same-day cleanup crews for events, grand openings, and emergencies.",
    from: 26,
  },
];

const WHY_TEMPS = [
  {
    icon: "💸",
    title: "No hiring costs",
    text: "No job ads, no interviews, no bad hires. We recruit, screen, and background-check every temp before they ever see your site.",
  },
  {
    icon: "📋",
    title: "No payroll, no taxes, no workers' comp",
    text: "Every temp is our W-2 employee. We handle pay, payroll taxes, unemployment, and workers' comp. You get one simple hourly bill.",
  },
  {
    icon: "📈",
    title: "Scale up or down weekly",
    text: "Need five cleaners this week and two next week? Done. No layoffs, no unemployment claims, no guilt.",
  },
  {
    icon: "🔁",
    title: "No-shows get replaced",
    text: "If a temp doesn't show, we send a replacement. Your shift stays covered — that's our problem, not yours.",
  },
  {
    icon: "🤝",
    title: "Try before you hire",
    text: "Love your temp? Hire them directly after 90 days on the job. You've already seen them work — no interview gamble.",
  },
  {
    icon: "⚡",
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
            Pay + ~25% for payroll taxes, unemployment & workers' comp — before
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
    <main className="site-shell">
      {/* HERO */}
      <section
        className="panel"
        style={{ padding: "48px 32px", textAlign: "center", overflow: "hidden" }}
      >
        <p className="kicker">Lilly B&apos;s Temp Cleaning Staffing</p>
        <h1 style={{ fontSize: 40, margin: "10px 0 14px", lineHeight: 1.15 }}>
          Your next cleaner is already hired.
          <br />
          By us.
        </h1>
        <p
          style={{
            color: "var(--muted)",
            maxWidth: 660,
            margin: "0 auto 26px",
            fontSize: 17,
          }}
        >
          We send background-checked temp cleaners to your site — offices,
          homes, construction sites, warehouses. One hourly rate covers their
          pay, taxes, and workers&apos; comp. You just point them at the dirt.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <Link
            href="/temp/book"
            className="btn-primary"
            style={{ padding: "14px 32px", fontSize: 16 }}
          >
            Get cleaners
          </Link>
          <Link
            href="#worth-it"
            className="btn-ghost"
            style={{ padding: "14px 32px", fontSize: 16 }}
          >
            Is it worth it?
          </Link>
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            justifyContent: "center",
            flexWrap: "wrap",
            fontSize: 14,
            color: "var(--muted)",
          }}
        >
          <span>✅ Background-checked temps</span>
          <span>✅ 4-hour minimum, no long contracts</span>
          <span>✅ Temp-to-hire after 90 days</span>
        </div>
      </section>

      {/* WORTH-IT CALCULATOR */}
      <section id="worth-it" className="panel" style={{ padding: 32, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>
          Temps cost more per hour. Here&apos;s why companies still choose them.
        </h2>
        <p
          style={{
            color: "var(--muted)",
            textAlign: "center",
            maxWidth: 640,
            margin: "0 auto 22px",
          }}
        >
          A direct hire at $17/hr really costs you ~$21/hr once payroll taxes,
          unemployment, and workers&apos; comp are in. Then add job ads,
          interviews, turnover, and the weeks a seat sits empty.
        </p>
        <WorthItCalculator rates={rates} />
      </section>

      {/* RATE CARD */}
      <section className="panel" style={{ padding: 32, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>
          Straightforward rates. No surprises.
        </h2>
        <p
          style={{
            color: "var(--muted)",
            textAlign: "center",
            maxWidth: 620,
            margin: "0 auto 22px",
          }}
        >
          Per cleaner, per hour. The rate depends on the job type — harder,
          skilled, or long-term work prices differently, and that&apos;s fair to
          everyone.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {SERVICES.map((s) => (
            <div key={s.key} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <h3 style={{ margin: "10px 0 6px" }}>{s.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 10px" }}>
                {s.text}
              </p>
              <div style={{ fontWeight: 800, color: "var(--brand-deep)" }}>
                from ${rateFor(s.key, s.from)}/hr
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 16 }}>
          Final quote depends on cleaners needed, hours, schedule, and job
          details. Long-term and high-volume jobs earn lower rates —{" "}
          <Link href="/temp/book" style={{ fontWeight: 700 }}>
            get your exact price
          </Link>
          .
        </p>
      </section>

      {/* WHY TEMPS */}
      <section className="panel" style={{ padding: 32, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>
          Why companies staff with temps instead of hiring
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {WHY_TEMPS.map((w) => (
            <div key={w.title} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 28 }}>{w.icon}</div>
              <h3 style={{ margin: "10px 0 6px" }}>{w.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
                {w.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="panel" style={{ padding: 32, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>How it works</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {[
            {
              n: "1",
              t: "Tell us what you need",
              d: "How many cleaners, what kind of job, when and where. Get your price up front — per cleaner, per hour.",
            },
            {
              n: "2",
              t: "We send the crew",
              d: "Background-checked temps arrive, clock in with GPS verification, and get to work under your direction.",
            },
            {
              n: "3",
              t: "Pay only for hours worked",
              d: "One bill. No payroll, no taxes, no comp paperwork. Love your temp? Hire them after 90 days.",
            },
          ].map((s) => (
            <div key={s.n} className="card" style={{ padding: 20, textAlign: "center" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: "var(--brand)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 20,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.n}
              </div>
              <h3 style={{ margin: "12px 0 6px" }}>{s.t}</h3>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link
            href="/temp/book"
            className="btn-primary"
            style={{ padding: "14px 36px", fontSize: 16 }}
          >
            Request cleaners
          </Link>
        </div>
      </section>

      {/* TEMP TO HIRE */}
      <section
        className="panel"
        style={{ padding: 32, marginTop: 20, textAlign: "center" }}
      >
        <h2 style={{ marginTop: 0 }}>Try them for 90 days. Then steal them. 🤝</h2>
        <p
          style={{
            color: "var(--muted)",
            maxWidth: 620,
            margin: "0 auto",
            fontSize: 16,
          }}
        >
          Temp-to-hire is the closest thing to a working interview. Your temp
          works on your site, on your schedule, for 90 days — and if
          they&apos;re a fit, you hire them directly onto your payroll. No
          recruiter fees, no interview gamble. You&apos;ve already watched them
          work.
        </p>
      </section>

      {/* FAQ */}
      <section className="panel" style={{ padding: 32, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>
          Questions companies ask us
        </h2>
        <div style={{ maxWidth: 760, margin: "20px auto 0" }}>
          {FAQS.map((f) => (
            <details
              key={f.q}
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "14px 4px",
              }}
            >
              <summary
                style={{ fontWeight: 700, cursor: "pointer", fontSize: 15 }}
              >
                {f.q}
              </summary>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* WORKER CTA */}
      <section
        className="panel"
        style={{ padding: 32, marginTop: 20, textAlign: "center" }}
      >
        <h2 style={{ marginTop: 0 }}>Looking for work?</h2>
        <p style={{ color: "var(--muted)", maxWidth: 560, margin: "0 auto 20px" }}>
          Join our temp crew — pick up shifts at offices, homes, construction
          sites, and warehouses across east-central Missouri. You&apos;re our
          W-2 employee: steady pay, workers&apos; comp, and a path to get hired
          on full-time.
        </p>
        <Link
          href="/temp/apply"
          className="btn-ghost"
          style={{ padding: "12px 30px" }}
        >
          Apply as a temp
        </Link>
      </section>

      {/* FINAL CTA */}
      <section
        className="panel"
        style={{
          padding: "40px 32px",
          marginTop: 20,
          textAlign: "center",
          background: "var(--brand-deep)",
          color: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fff" }}>
          Short-staffed? Let&apos;s fix that.
        </h2>
        <p style={{ opacity: 0.85, maxWidth: 560, margin: "0 auto 24px" }}>
          Tell us what you need — we&apos;ll price it by the cleaner, by the
          hour, and have a crew ready. No contracts to sign just to get a quote.
        </p>
        <Link
          href="/temp/book"
          className="btn-primary"
          style={{
            padding: "14px 40px",
            fontSize: 16,
            background: "#fff",
            color: "var(--brand-deep)",
          }}
        >
          Get my price
        </Link>
      </section>
    </main>
  );
}
