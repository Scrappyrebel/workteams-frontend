"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TIERS } from "../lib/tiers";
import { getTierPrices } from "../lib/product";

// Public national sales page for WorkTeams. Signed-in visitors are redirected
// into the app by app/page.js, so everyone here is a prospective customer.
export default function LandingContent() {
  const tierKeys = ["starter", "plus", "pro"];
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    getTierPrices().then(setPrices);
  }, []);

  return (
    <main className="wt-site">
      <SiteNav />
      <Hero />
      <FounderStrip />
      <Features />
      <HowItWorks />
      <Pricing tierKeys={tierKeys} prices={prices} />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

function SiteNav() {
  return (
    <header className="wt-nav">
      <Link href="/" className="wt-nav-brand">
        <span className="wt-mark" aria-hidden="true">WT</span>
        <span>WorkTeams</span>
      </Link>
      <nav className="wt-nav-links" aria-label="Page sections">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div className="wt-nav-cta">
        <Link href="/login" className="wt-btn wt-btn-ghost">Sign in</Link>
        <Link href="/login" className="wt-btn wt-btn-primary">Get started free</Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="wt-hero">
      <div className="wt-hero-inner">
        <p className="wt-eyebrow">Built by a cleaner, not a tech company</p>
        <h1>The app that thinks like a cleaner.</h1>
        <p className="wt-lede">
          WorkTeams runs your cleaning business the way you already run it. Walk the
          building, measure the rooms, check off the scope, price it by the hour or by
          the square foot — then schedule the crew, track their hours by GPS, and hand
          payroll-ready reports to your accountant. One app, built mobile-first for the
          people doing the work.
        </p>
        <div className="wt-cta-row">
          <Link href="/login" className="wt-btn wt-btn-primary wt-btn-lg">Get started free</Link>
          <a href="#pricing" className="wt-btn wt-btn-outline wt-btn-lg">See the plans</a>
        </div>
        <div className="wt-hero-proof">
          <div className="wt-proof">
            <strong>Scheduling</strong>
            <span>Every shift, every crew, on their phone</span>
          </div>
          <div className="wt-proof">
            <strong>GPS time clock</strong>
            <span>Know who&apos;s on site, and prove it</span>
          </div>
          <div className="wt-proof">
            <strong>Walkthrough bidding</strong>
            <span>Measure rooms, scope the work, price it right</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FounderStrip() {
  return (
    <section className="wt-founder">
      <div className="wt-founder-inner">
        <p className="wt-eyebrow">Why it&apos;s different</p>
        <h2>Made by someone who&apos;s done a thousand walkthroughs.</h2>
        <p>
          Most crew software is designed by people who have never held a mop. WorkTeams
          was built by a cleaning company owner who got tired of apps that don&apos;t
          understand the job — so the walkthrough works like a real walkthrough, pricing
          works like real pricing, and the time clock works from a parking lot at 6am.
          No flat-rate guessing. No office-only features. Just the trade, in your pocket.
        </p>
      </div>
    </section>
  );
}

const FEATURE_GROUPS = [
  {
    title: "Win the job",
    copy: "Go from first call to signed contract without a clipboard.",
    items: [
      ["Room-by-room walkthroughs", "Type in each room's measurements and check off the scope as you tour the building."],
      ["Honest pricing", "Price by the hour, by the square foot, or by base rate — your call, your numbers."],
      ["Bids & proposals", "Send a clean online quote and get the contract signed."],
    ],
  },
  {
    title: "Run the crew",
    copy: "Everyone knows where to be, and you know they showed up.",
    items: [
      ["Scheduling", "Build shifts in seconds. Your crew sees them on their phones."],
      ["GPS time clock", "Clock in from the job site — with proof of where they were."],
      ["Geofenced clock-in", "Nobody clocks in from the couch. Set a radius per location."],
      ["Late & no-show alerts", "Know the minute a shift goes sideways."],
      ["Crew messaging", "Reach the whole team without group-text chaos."],
    ],
  },
  {
    title: "Know your numbers",
    copy: "Stop guessing whether a job made money.",
    items: [
      ["Payroll-ready hour reports", "Clean hour totals and CSV exports your payroll provider will love."],
      ["Job profitability", "See what each contract actually earned after labor and supplies."],
      ["Inspections with photos", "Quality checks your clients can see."],
      ["Work orders & supplies", "Track jobs and stock without the spreadsheet."],
      ["Client portal", "Give customers a professional window into their service."],
    ],
  },
];

function Features() {
  return (
    <section id="features" className="wt-section">
      <p className="wt-eyebrow">Features</p>
      <h2>Everything a cleaning company needs. Nothing it doesn&apos;t.</h2>
      <div className="wt-groups">
        {FEATURE_GROUPS.map((g) => (
          <article key={g.title} className="wt-group-card">
            <h3>{g.title}</h3>
            <p className="wt-group-copy">{g.copy}</p>
            <ul>
              {g.items.map(([title, desc]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  ["Walk in", "Capture the lead and confirm the tour — the job starts at the front door."],
  ["Measure & scope", "Type each room's dimensions and check off exactly what gets cleaned."],
  ["Price it right", "Per hour, per square foot, or base rate. The math follows your trade, not the other way around."],
  ["Quote & sign", "Send the online quote, get the contract signed, schedule the crew."],
];

function HowItWorks() {
  return (
    <section id="how" className="wt-how">
      <div className="wt-how-inner">
        <p className="wt-eyebrow">How it works</p>
        <h2>From walkthrough to paycheck in four steps.</h2>
        <ol className="wt-steps">
          {STEPS.map(([title, desc], i) => (
            <li key={title}>
              <span className="wt-step-num" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pricing({ tierKeys, prices }) {
  return (
    <section id="pricing" className="wt-section">
      <p className="wt-eyebrow">Pricing</p>
      <h2>Three simple tiers. Priced for cleaning companies.</h2>
      <p className="wt-section-sub">
        Start free, pick the tier that fits, change it anytime as you grow.
      </p>
      <div className="wt-tiers">
        {tierKeys.map((key, i) => {
          const tier = TIERS[key];
          const price = prices ? prices[key] : tier.examplePrice;
          const featured = key === "plus";
          return (
            <article key={key} className={featured ? "wt-tier wt-tier-featured" : "wt-tier"}>
              {featured && <span className="wt-tier-badge">Most popular</span>}
              <h3>{tier.name}</h3>
              <p className="wt-tier-price">
                <span className="wt-price">${price}</span>
                <span className="wt-per">/month</span>
              </p>
              <p className="wt-tier-tag">{tier.tagline}</p>
              <ul>
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link
                href="/login"
                className={featured ? "wt-btn wt-btn-primary wt-btn-block" : "wt-btn wt-btn-outline wt-btn-block"}
              >
                {i === 0 ? "Start free" : `Choose ${tier.name}`}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const FAQS = [
  [
    "Does WorkTeams do payroll?",
    "No — and that's on purpose. You get payroll-ready hour reports and CSV exports, plus connections to Gusto, ADP, Paychex, and QuickBooks. You run payroll your way; we make sure the hours are right.",
  ],
  [
    "Do my cleaners need an expensive phone?",
    "Any smartphone works. WorkTeams is built mobile-first — the time clock, schedule, and messages all live in the browser, so there's nothing to install and no training manual.",
  ],
  [
    "I've never used crew software. Is this overkill?",
    "If you're still texting schedules and guessing at bids, this is exactly for you. Start with Starter: schedules, the GPS time clock, and hour reports. Add the rest when you're ready.",
  ],
  [
    "Can I switch tiers later?",
    "Anytime. Move up when you add services, move down in a slow season. Your data stays put.",
  ],
  [
    "Who sees my business data?",
    "Only your company. Every company's data is walled off — your crews, hours, and bids are never shared or visible to anyone else.",
  ],
];

function Faq() {
  return (
    <section className="wt-section wt-faq">
      <p className="wt-eyebrow">Questions</p>
      <h2>Straight answers.</h2>
      <div className="wt-faq-list">
        {FAQS.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="wt-final">
      <h2>Your next walkthrough could quote itself.</h2>
      <p>Join WorkTeams free and run your cleaning business from your pocket.</p>
      <Link href="/login" className="wt-btn wt-btn-primary wt-btn-lg">Get started free</Link>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="wt-footer">
      <div className="wt-footer-inner">
        <span className="wt-nav-brand">
          <span className="wt-mark" aria-hidden="true">WT</span>
          <span>WorkTeams</span>
        </span>
        <p>Built by a cleaner, for cleaners. © 2026 WorkTeams.</p>
        <Link href="/login">Sign in</Link>
      </div>
    </footer>
  );
}
