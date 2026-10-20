"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TIERS } from "../lib/tiers";
import { SUPPORT_EMAIL } from "../lib/app-url";
import { getTierPrices } from "../lib/product";

// Public national sales page for WorkTeams — 2026 visual refresh.
// Signed-in visitors are redirected into the app by app/page.js, so everyone
// here is a prospective customer. All pricing/trial/feature claims match the
// live product exactly; this file is presentation only.
//
// TESTIMONIALS: when real customer quotes are approved for use, build a
// <Testimonials /> section here (between <Staffing /> and <Pricing />) with
// three quote cards: quote text, reviewer first name + company type only.
// Do NOT invent quotes, names, or customer counts — slots stay empty until
// real, approved words exist.

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
  calendar: (
    <Svg>
      <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
    </Svg>
  ),
  clockPin: (
    <Svg>
      <path d="M12 21.5s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" />
      <path d="M12 7v3.4l2.3 1.6" />
    </Svg>
  ),
  ruler: (
    <Svg>
      <path d="M2.8 15.2 15.2 2.8a1.8 1.8 0 0 1 2.5 0l3.5 3.5a1.8 1.8 0 0 1 0 2.5L8.8 21.2a1.8 1.8 0 0 1-2.5 0l-3.5-3.5a1.8 1.8 0 0 1 0-2.5z" />
      <path d="M7.5 13.5l1.8 1.8M10.5 10.5l1.8 1.8M13.5 7.5l1.8 1.8" />
    </Svg>
  ),
  tag: (
    <Svg>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  ),
  fileSign: (
    <Svg>
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 2.5v6h6" />
      <path d="M8.5 17.5c1-2 2-2 3 0 .7 1.4 1.7 1.2 2.5-.5" />
    </Svg>
  ),
  target: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  ),
  bell: (
    <Svg>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.7 8-2.7 8h17.4s-2.7-1.5-2.7-8" />
      <path d="M10.4 20.5a2 2 0 0 0 3.2 0" />
    </Svg>
  ),
  chat: (
    <Svg>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-5.3A8.5 8.5 0 1 1 21 11.5z" />
    </Svg>
  ),
  report: (
    <Svg>
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H8" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8.5 15.5v2M12 13v4.5M15.5 11v6.5" />
    </Svg>
  ),
  chart: (
    <Svg>
      <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" />
      <path d="M7.5 15.5 11.5 10l3 3 4.5-5.5" />
      <path d="M15.5 7.5H19V11" />
    </Svg>
  ),
  camera: (
    <Svg>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5A2.5 2.5 0 0 1 4.5 6h3L9.5 3h5L16.5 6h3A2.5 2.5 0 0 1 22 8.5z" />
      <circle cx="12" cy="13" r="3.8" />
    </Svg>
  ),
  box: (
    <Svg>
      <path d="M21 16.5v-8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8.5v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </Svg>
  ),
  portal: (
    <Svg>
      <rect x="3" y="4" width="18" height="16.5" rx="2" />
      <path d="M3 8.8h18" />
      <circle cx="6.4" cy="6.4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="9.6" cy="6.4" r=".9" fill="currentColor" stroke="none" />
      <path d="M7 13h6M7 16.5h9" />
    </Svg>
  ),
  users: (
    <Svg>
      <path d="M16.5 20.5v-1.7a4.3 4.3 0 0 0-4.3-4.3H6a4.3 4.3 0 0 0-4.3 4.3v1.7" />
      <circle cx="9.1" cy="7.3" r="3.8" />
      <path d="M21.5 20.5v-1.7a4.3 4.3 0 0 0-3-4M15.5 3.7a3.8 3.8 0 0 1 0 7.2" />
    </Svg>
  ),
  check: (
    <Svg size={18}>
      <path d="M20 6.5 9.2 17.5 4 12.3" />
    </Svg>
  ),
  shield: (
    <Svg>
      <path d="M12 21.5s7.5-3.8 7.5-9.5V5.2L12 2.5 4.5 5.2V12c0 5.7 7.5 9.5 7.5 9.5z" />
      <path d="M9 11.6l2.2 2.2 4-4.2" />
    </Svg>
  ),
  phone: (
    <Svg>
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M11 18.5h2" />
    </Svg>
  ),
  switchTiers: (
    <Svg>
      <path d="M4 7.5h13M13.5 3.8 17.2 7.5l-3.7 3.7M20 16.5H7M10.5 12.8 6.8 16.5l3.7 3.7" />
    </Svg>
  ),
  door: (
    <Svg>
      <path d="M14.5 3h4A1.5 1.5 0 0 1 20 4.5v15A1.5 1.5 0 0 1 18.5 21h-4" />
      <path d="M10 17.5 14.8 12 10 6.5M14.8 12H3" />
    </Svg>
  ),
  pen: (
    <Svg>
      <path d="M12 20h8.5" />
      <path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L7.5 18.7 3.5 19.7l1-4z" />
    </Svg>
  ),
  arrow: (
    <Svg size={20}>
      <path d="M4.5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  spark: (
    <Svg size={18}>
      <path d="M12 3l1.9 5.3L19.5 10l-5.6 1.9L12 17l-1.9-5.1L4.5 10l5.6-1.7z" />
    </Svg>
  ),
};

/* ------------------------------- page ---------------------------------- */
export default function LandingContent() {
  const tierKeys = ["starter", "plus", "pro"];
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    getTierPrices().then(setPrices);
  }, []);

  return (
    <main className="wt2-site">
      <SiteNav />
      <Hero />
      <FounderStrip />
      <Features />
      <HowItWorks />
      <Staffing />
      {/* Testimonials section goes here once real, approved quotes exist. */}
      <Assurance />
      <Pricing tierKeys={tierKeys} prices={prices} />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

function SiteNav() {
  return (
    <header className="wt2-nav">
      <Link href="/" className="wt2-nav-brand">
        <span className="wt2-mark" aria-hidden="true">WT</span>
        <span>WorkTeams</span>
      </Link>
      <nav className="wt2-nav-links" aria-label="Page sections">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#staffing">Staffing</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="wt2-nav-cta">
        <Link href="/login" className="wt2-btn wt2-btn-ghost">Sign in</Link>
        <Link href="/login" className="wt2-btn wt2-btn-primary">Start free trial</Link>
      </div>
    </header>
  );
}

/* A stylized phone rendering of the crew app — illustrative UI, built from
   divs so it stays crisp at any size. Sample shift rows are generic. */
function PhoneMock() {
  return (
    <div className="wt2-phone-wrap" aria-hidden="true">
      <div className="wt2-chip wt2-chip-a">
        <span className="wt2-chip-ic">{I.clockPin}</span>
        <span>
          <strong>Clocked in</strong>
          <small>GPS verified on site</small>
        </span>
      </div>
      <div className="wt2-phone">
        <div className="wt2-phone-bar">
          <span className="wt2-dot" />
          <span className="wt2-dot" />
          <span className="wt2-dot" />
        </div>
        <div className="wt2-phone-head">
          <span className="wt2-mark wt2-mark-sm">WT</span>
          <div>
            <strong>Today&apos;s shifts</strong>
            <small>Tuesday · 3 jobs</small>
          </div>
        </div>
        <div className="wt2-shift wt2-shift-live">
          <div className="wt2-shift-top">
            <strong>Office clean — Downtown</strong>
            <span className="wt2-live-pill">On site</span>
          </div>
          <p>Crew of 2 · 6:00 AM</p>
          <div className="wt2-shift-bar"><span style={{ width: "68%" }} /></div>
          <p className="wt2-shift-note">Clocked in · GPS verified</p>
        </div>
        <div className="wt2-shift">
          <div className="wt2-shift-top">
            <strong>Medical clinic — Nightly</strong>
            <span className="wt2-time-pill">7:30 PM</span>
          </div>
          <p>Crew of 3 · Recurring</p>
        </div>
        <div className="wt2-shift">
          <div className="wt2-shift-top">
            <strong>Walkthrough — New bid</strong>
            <span className="wt2-time-pill">2:00 PM</span>
          </div>
          <p>Measure rooms · Check the scope</p>
        </div>
        <div className="wt2-phone-cta">Clock in</div>
        <div className="wt2-phone-tabs">
          <span className="wt2-tab wt2-tab-on" />
          <span className="wt2-tab" />
          <span className="wt2-tab" />
          <span className="wt2-tab" />
        </div>
      </div>
      <div className="wt2-chip wt2-chip-b">
        <span className="wt2-chip-ic">{I.fileSign}</span>
        <span>
          <strong>Bid sent</strong>
          <small>Priced by the square foot</small>
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="wt2-hero">
      <div className="wt2-hero-glow wt2-glow-a" aria-hidden="true" />
      <div className="wt2-hero-glow wt2-glow-b" aria-hidden="true" />
      <div className="wt2-hero-inner">
        <div className="wt2-hero-copy">
          <p className="wt2-eyebrow-pill">
            <span className="wt2-pill-ic">{I.spark}</span>
            Built by a cleaner, not a tech company
          </p>
          <h1>
            The app that thinks like a <span className="wt2-grad-text">cleaner.</span>
          </h1>
          <p className="wt2-lede">
            WorkTeams runs your cleaning business the way you already run it. Walk the
            building, measure the rooms, check off the scope, price it by the hour or by
            the square foot — then schedule the crew, track their hours by GPS, and hand
            payroll-ready reports to your accountant. One app, built mobile-first for the
            people doing the work.
          </p>
          <div className="wt2-cta-row">
            <Link href="/login" className="wt2-btn wt2-btn-primary wt2-btn-lg wt2-btn-glow">
              Start free trial {I.arrow}
            </Link>
            <a href="#pricing" className="wt2-btn wt2-btn-outline wt2-btn-lg">See the plans</a>
          </div>
          <p className="wt2-cta-note">7-day free trial · No card required</p>
          <div className="wt2-hero-proof">
            <div className="wt2-proof">
              <span className="wt2-proof-ic">{I.calendar}</span>
              <div>
                <strong>Scheduling</strong>
                <span>Every shift, every crew, on their phone</span>
              </div>
            </div>
            <div className="wt2-proof">
              <span className="wt2-proof-ic">{I.clockPin}</span>
              <div>
                <strong>GPS time clock</strong>
                <span>Know who&apos;s on site, and prove it</span>
              </div>
            </div>
            <div className="wt2-proof">
              <span className="wt2-proof-ic">{I.ruler}</span>
              <div>
                <strong>Walkthrough bidding</strong>
                <span>Measure rooms, scope the work, price it right</span>
              </div>
            </div>
          </div>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}

function FounderStrip() {
  return (
    <section className="wt2-founder">
      <div className="wt2-founder-inner">
        <span className="wt2-quote-mark" aria-hidden="true">&ldquo;</span>
        <div>
          <p className="wt2-eyebrow wt2-eyebrow-light">Why it&apos;s different</p>
          <h2>Made by someone who&apos;s done a thousand walkthroughs.</h2>
          <p>
            Most crew software is designed by people who have never held a mop. WorkTeams
            was built by a cleaning company owner who got tired of apps that don&apos;t
            understand the job — so the walkthrough works like a real walkthrough, pricing
            works like real pricing, and the time clock works from a parking lot at 6am.
            No flat-rate guessing. No office-only features. Just the trade, in your pocket.
          </p>
        </div>
      </div>
    </section>
  );
}

const FEATURE_GROUPS = [
  {
    title: "Win the job",
    copy: "Go from first call to signed contract without a clipboard.",
    accent: "wt2-accent-a",
    items: [
      [I.ruler, "Room-by-room walkthroughs", "Type in each room's measurements and check off the scope as you tour the building."],
      [I.tag, "Honest pricing", "Price by the hour, by the square foot, or by base rate — your call, your numbers."],
      [I.fileSign, "Bids & proposals", "Send a clean online quote and get the contract signed."],
    ],
  },
  {
    title: "Run the crew",
    copy: "Everyone knows where to be, and you know they showed up.",
    accent: "wt2-accent-b",
    items: [
      [I.calendar, "Scheduling", "Build shifts in seconds. Your crew sees them on their phones."],
      [I.clockPin, "GPS time clock", "Clock in from the job site — with proof of where they were."],
      [I.target, "Geofenced clock-in", "Nobody clocks in from the couch. Set a radius per location."],
      [I.bell, "Late & no-show alerts", "Know the minute a shift goes sideways."],
      [I.chat, "Crew messaging", "Reach the whole team without group-text chaos."],
    ],
  },
  {
    title: "Know your numbers",
    copy: "Stop guessing whether a job made money.",
    accent: "wt2-accent-c",
    items: [
      [I.report, "Payroll-ready hour reports", "Clean hour totals and CSV exports your payroll provider will love."],
      [I.chart, "Job profitability", "See what each contract actually earned after labor and supplies."],
      [I.camera, "Inspections with photos", "Quality checks your clients can see."],
      [I.box, "Work orders & supplies", "Track jobs and stock without the spreadsheet."],
      [I.portal, "Client portal", "Give customers a professional window into their service."],
    ],
  },
];

function Features() {
  return (
    <section id="features" className="wt2-section">
      <p className="wt2-eyebrow">Features</p>
      <h2 className="wt2-h2">Everything a cleaning company needs. Nothing it doesn&apos;t.</h2>
      <div className="wt2-groups">
        {FEATURE_GROUPS.map((g) => (
          <article key={g.title} className={`wt2-group-card ${g.accent}`}>
            <h3>{g.title}</h3>
            <p className="wt2-group-copy">{g.copy}</p>
            <ul>
              {g.items.map(([icon, title, desc]) => (
                <li key={title}>
                  <span className="wt2-feat-ic">{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
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
  [I.door, "Walk in", "Capture the lead and confirm the tour — the job starts at the front door."],
  [I.ruler, "Measure & scope", "Type each room's dimensions and check off exactly what gets cleaned."],
  [I.tag, "Price it right", "Per hour, per square foot, or base rate. The math follows your trade, not the other way around."],
  [I.pen, "Quote & sign", "Send the online quote, get the contract signed, schedule the crew."],
];

function HowItWorks() {
  return (
    <section id="how" className="wt2-how">
      <div className="wt2-how-inner">
        <p className="wt2-eyebrow">How it works</p>
        <h2 className="wt2-h2">From walkthrough to paycheck in four steps.</h2>
        <ol className="wt2-steps">
          {STEPS.map(([icon, title, desc], i) => (
            <li key={title} className="wt2-step">
              <span className="wt2-step-badge">
                <span className="wt2-step-ic">{icon}</span>
                <span className="wt2-step-num" aria-hidden="true">{i + 1}</span>
              </span>
              <strong>{title}</strong>
              <p>{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Staffing() {
  return (
    <section id="staffing" className="wt2-staffing">
      <div className="wt2-staffing-inner">
        <div className="wt2-staffing-copy">
          <p className="wt2-eyebrow wt2-eyebrow-light">More than cleaning crews</p>
          <h2>Run a temp staffing side, too.</h2>
          <p>
            WorkTeams also powers temp staffing. Keep a roster of ready-to-work temps
            with their skills and availability, take staffing requests straight from
            your clients, dispatch the right person for each shift, and let clients
            confirm hours right in their portal.
          </p>
          <div className="wt2-lane-row" aria-label="Staffing types">
            {["Cleaning", "Office", "Manufacturing", "Hospitality", "General labor"].map((lane) => (
              <span key={lane} className="wt2-lane">{lane}</span>
            ))}
          </div>
        </div>
        <div className="wt2-staffing-card">
          <span className="wt2-staffing-ic">{I.users}</span>
          <h3>See it in action</h3>
          <p>
            Lilly B&apos;s Temp Cleaning Staffing — temp cleaners on demand — runs on
            this same app, from client requests to confirmed hours.
          </p>
          <Link href="/temp" className="wt2-btn wt2-btn-light wt2-btn-block">
            Visit the temp staffing service {I.arrow}
          </Link>
        </div>
      </div>
    </section>
  );
}

const ASSURANCES = [
  [I.shield, "Your data stays yours", "Only your company. Every company's data is walled off — your crews, hours, and bids are never shared or visible to anyone else."],
  [I.phone, "Any smartphone works", "The time clock, schedule, and messages all live in the browser — nothing to install and no training manual."],
  [I.switchTiers, "Switch tiers anytime", "Move up when you add services, move down in a slow season. Your data stays put."],
];

function Assurance() {
  return (
    <section className="wt2-section wt2-assurance">
      <p className="wt2-eyebrow">Straight dealing</p>
      <h2 className="wt2-h2">Built to be trusted with your business.</h2>
      <div className="wt2-assure-grid">
        {ASSURANCES.map(([icon, title, desc]) => (
          <article key={title} className="wt2-assure-card">
            <span className="wt2-assure-ic">{icon}</span>
            <strong>{title}</strong>
            <p>{desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Pricing({ tierKeys, prices }) {
  return (
    <section id="pricing" className="wt2-section wt2-pricing">
      <p className="wt2-eyebrow">Pricing</p>
      <h2 className="wt2-h2">Three simple tiers. Priced for cleaning companies.</h2>
      <p className="wt2-section-sub">
        7-day free trial on every tier. No card required — pick your tier before the trial ends to keep going.
      </p>
      <div className="wt2-tiers">
        {tierKeys.map((key, i) => {
          const tier = TIERS[key];
          const price = prices ? prices[key] : tier.examplePrice;
          const featured = key === "plus";
          return (
            <article key={key} className={featured ? "wt2-tier wt2-tier-featured" : "wt2-tier"}>
              {featured && <span className="wt2-tier-badge">Most popular</span>}
              <h3>{tier.name}</h3>
              <p className="wt2-tier-price">
                <span className="wt2-price">${price}</span>
                <span className="wt2-per">/month</span>
              </p>
              <p className="wt2-tier-tag">{tier.tagline}</p>
              <ul>
                {tier.features.map((f) => (
                  <li key={f}>
                    <span className="wt2-check">{I.check}</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={featured ? "wt2-btn wt2-btn-primary wt2-btn-block" : "wt2-btn wt2-btn-outline wt2-btn-block"}
              >
                {i === 0 ? "Start free trial" : `Choose ${tier.name}`}
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
    "No — and that's on purpose. You get payroll-ready hour reports and CSV exports, plus links out to Gusto, ADP, Paychex, and QuickBooks. You run payroll your way; we make sure the hours are right.",
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
    <section id="faq" className="wt2-section wt2-faq">
      <p className="wt2-eyebrow">Questions</p>
      <h2 className="wt2-h2">Straight answers.</h2>
      <div className="wt2-faq-list">
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
    <section className="wt2-final">
      <div className="wt2-final-ring wt2-ring-a" aria-hidden="true" />
      <div className="wt2-final-ring wt2-ring-b" aria-hidden="true" />
      <h2>Your next walkthrough could quote itself.</h2>
      <p>Try WorkTeams free for 7 days and run your cleaning business from your pocket.</p>
      <Link href="/login" className="wt2-btn wt2-btn-light wt2-btn-lg wt2-btn-glow">
        Start free trial {I.arrow}
      </Link>
      <p className="wt2-final-note">7-day free trial · No card required</p>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="wt2-footer">
      <div className="wt2-footer-inner">
        <span className="wt2-nav-brand">
          <span className="wt2-mark" aria-hidden="true">WT</span>
          <span>WorkTeams</span>
        </span>
        <p>Built by a cleaner, for cleaners. © 2026 WorkTeams.</p>
        <p>Questions? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        <span className="wt2-footer-links">
          <Link href="/temp">Temp staffing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login">Sign in</Link>
        </span>
      </div>
    </footer>
  );
}
