"use client";

import { useEffect, useState } from "react";

function useChecklist(id, count) {
  const key = `temp-playbook:${id}`;
  const [checked, setChecked] = useState({});
  useEffect(() => {
    try {
      setChecked(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {}
  }, [key]);
  const toggle = (i) =>
    setChecked((c) => {
      const n = { ...c, [i]: !c[i] };
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {}
      return n;
    });
  const reset = () => {
    setChecked({});
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  const done = Object.values(checked).filter(Boolean).length;
  return { checked, toggle, reset, done, count };
}

function Checklist({ id, items }) {
  const { checked, toggle, reset, done } = useChecklist(id, items.length);
  return (
    <div style={{ marginTop: 10 }}>
      {items.map((item, i) => (
        <label
          key={i}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "8px 0",
            borderBottom: "1px solid var(--border)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={!!checked[i]}
            onChange={() => toggle(i)}
            style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }}
          />
          <span
            style={{
              textDecoration: checked[i] ? "line-through" : "none",
              color: checked[i] ? "var(--muted)" : "inherit",
            }}
          >
            {item}
          </span>
        </label>
      ))}
      <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
        {done} of {items.length} done
        {done > 0 && (
          <button
            onClick={reset}
            style={{
              marginLeft: 12,
              background: "none",
              border: "none",
              color: "var(--brand-deep)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ step, idPrefix }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--bg)",
          border: "none",
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>{step.title}</span>
        <span style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 16px 16px" }}>
          {step.detail && (
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0" }}>
              {step.detail}
            </p>
          )}
          {step.checklist && (
            <Checklist id={`${idPrefix}-${step.title}`} items={step.checklist} />
          )}
        </div>
      )}
    </div>
  );
}

const DEPARTMENTS = [
  {
    key: "sales",
    icon: "📞",
    title: "Sales — Getting Clients",
    intro:
      "How we find companies that need cleaners, walk their site, and close the deal. The site walk is the most important part — never quote blind.",
    steps: [
      {
        title: "1. Know who to call",
        detail:
          "Best targets: offices, medical/dental clinics, manufacturers, warehouses, property managers, general contractors, churches, schools, event venues. Anyone with a facility and no full-time cleaner — or a cleaner who's about to quit.",
        checklist: [
          "Build a target list: 20 companies in our service area to start",
          "Note the decision maker (office manager, plant manager, property manager)",
          "Check if they currently have a cleaner — and what's wrong with them",
        ],
      },
      {
        title: "2. Make the pitch",
        detail:
          "Keep it short. The whole pitch is: one hourly rate, no hiring headache, and you can try the temp for 90 days before hiring them. Lead with their pain (short-staffed, turnover, unreliable cleaner).",
        checklist: [
          "Introduce Lilly B's Temp Cleaning Staffing — temp cleaners on demand",
          "Ask what they're doing for cleaning now and what's not working",
          "Explain: one hourly rate covers pay, taxes, workers' comp — no HR",
          "Mention temp-to-hire: try them 90 days, then hire them yourself",
          "Ask for a 20-minute site walk — that's the goal of the call",
        ],
      },
      {
        title: "3. The site walk (never skip this)",
        detail:
          "Walk every area the temp will clean. Measure or pace off square footage. This is where the quote comes from — and where you spot hazards before a temp does.",
        checklist: [
          "Meet the decision maker — get their cell number and email",
          "Walk every room/area to be cleaned, with them if possible",
          "Estimate square footage of each area",
          "List the scope: restrooms, trash, dusting, mopping, windows, etc.",
          "Note hazards: chemicals, machinery, locked areas, ladders/heights",
          "Access: keys, door codes, alarm codes, parking, which entrance",
          "Supplies: who provides chemicals, paper products, equipment?",
          "Schedule: which days, what times, how often",
          "Take photos of each area (ask permission first)",
          "Ask what they like/dislike about their current cleaning situation",
        ],
      },
      {
        title: "4. Build and send the quote",
        detail:
          "Use the rate card in Agency Settings. Estimate hours from square footage (offices ~2,500–4,000 sq ft per labor-hour; homes much less). Quote per cleaner, per hour — never flat rate.",
        checklist: [
          "Pick the rate for the job type from the rate card",
          "Estimate labor hours from square footage and scope",
          "Send the written quote within 24 hours of the walk",
          "Include: rate, estimated hours, 4-hour minimum, what's included",
        ],
      },
      {
        title: "5. Follow up and close",
        detail:
          "Most deals close on the follow-up, not the first visit. If they go quiet, they're still deciding — stay on it without being pushy.",
        checklist: [
          "Follow up 2 days after the quote (call, not just text)",
          "Follow up again at 7 days if no answer",
          "When they say yes: get billing contact + payment method on file",
          "Confirm start date, schedule, and site contact",
          "Hand off to customer service with all site notes and photos",
        ],
      },
    ],
  },
  {
    key: "service",
    icon: "💬",
    title: "Customer Service — Keeping Clients",
    intro:
      "Sales gets them in the door — service keeps them paying. The first two weeks decide whether a client stays.",
    steps: [
      {
        title: "1. Welcome every new client",
        detail:
          "Before the first shift, confirm everything in writing so there's no confusion on day one.",
        checklist: [
          "Send a welcome message with your name and cell number",
          "Confirm schedule, site address, and where temps check in",
          "Confirm the site contact's name and number",
          "Share any site notes (alarms, locked areas, supply closet)",
        ],
      },
      {
        title: "2. Check in after the first shift",
        detail:
          "Call the client the day after the first shift. This one call catches 90% of problems while they're small.",
        checklist: [
          "Call the client: how did the first shift go?",
          "Ask specifically: on time? right areas? anything missed?",
          "Fix anything immediately — send someone back if needed",
          "Log their feedback with the job record",
        ],
      },
      {
        title: "3. Ongoing check-ins",
        detail:
          "Don't wait for complaints. A quick monthly check-in keeps small issues from becoming cancellations.",
        checklist: [
          "Monthly check-in call or text for ongoing clients",
          "Ask: anything we should do differently?",
          "Note any schedule changes (holidays, shutdowns, events)",
        ],
      },
      {
        title: "4. Handle complaints fast",
        detail:
          "A complaint is a client giving you a second chance. Move fast, fix it, and follow up.",
        checklist: [
          "Listen and write down exactly what went wrong",
          "Apologize and tell them what you'll do — today",
          "Fix it: re-clean, replace the temp, or credit the hours",
          "Follow up within 48 hours to confirm it's resolved",
        ],
      },
      {
        title: "5. Temp-to-hire handoff",
        detail:
          "At 90 days (6 months for long-term), remind the client they can hire their temp directly. Make it easy — that's the selling point.",
        checklist: [
          "Flag temps approaching 90 days on a client site",
          "Ask the client: want to hire them on? Here's how it works",
          "Coordinate the last temp shift and the hire date",
          "Invoice any conversion fee per the agreement",
        ],
      },
    ],
  },
  {
    key: "accounting",
    icon: "🧾",
    title: "Accounting — Money In, Money Out",
    intro:
      "Every dollar is tracked per cleaner, per hour. Verify hours before anyone gets billed or paid.",
    steps: [
      {
        title: "1. Verify hours before billing",
        detail:
          "Never invoice off memory. Hours come from the GPS-verified clock in/out — that's the source of truth.",
        checklist: [
          "Pull clock-in/out times for every temp, every job",
          "Flag anything odd: missed clock-out, very short/long shifts",
          "Resolve discrepancies with the field supervisor before invoicing",
        ],
      },
      {
        title: "2. Bill the clients",
        detail:
          "Invoice per the schedule in the client agreement (weekly or biweekly). Each line: temp name, dates, hours, rate.",
        checklist: [
          "Generate invoices from verified hours × the quoted rate",
          "Send invoices on the agreed schedule — same day every cycle",
          "Follow up on unpaid invoices at 7 and 14 days overdue",
        ],
      },
      {
        title: "3. Pay the temps",
        detail:
          "Temps are our W-2 employees on the regular payroll. Late or wrong pay kills retention faster than anything.",
        checklist: [
          "Approve verified hours for payroll by the cutoff",
          "Run payroll on schedule — every time, no exceptions",
          "Handle pay questions within 24 hours",
        ],
      },
      {
        title: "4. Overtime",
        detail:
          "Missouri: overtime over 40 hours/week at 1.5× the temp's pay. The client is billed 1.5× the bill rate for those hours.",
        checklist: [
          "Watch for temps approaching 40 hours across all assignments",
          "Bill OT hours at 1.5× the bill rate",
          "Pay the temp 1.5× their hourly pay for OT hours",
        ],
      },
      {
        title: "5. Month-end",
        detail:
          "Once a month, reconcile everything so nothing leaks.",
        checklist: [
          "Reconcile client invoices vs. payments received",
          "Reconcile temp hours vs. payroll paid",
          "Review profit per client: (billed − temp pay − taxes − comp)",
          "Confirm payroll tax deposits are current",
        ],
      },
    ],
  },
  {
    key: "hr",
    icon: "📝",
    title: "HR — Hiring Temps",
    intro:
      "Every temp is our W-2 employee. Hire carefully, paper them correctly, and set expectations on day one.",
    steps: [
      {
        title: "1. Recruit",
        detail:
          "Good temps come from referrals more than job boards. Always be recruiting — you need a bench, not just enough for today.",
        checklist: [
          "Post openings: Facebook community groups, job boards, walk-in flyers",
          "Ask current temps for referrals (best source)",
          "Keep a waitlist — review applications weekly even when fully staffed",
        ],
      },
      {
        title: "2. Review the application",
        detail:
          "Applications come in through the /temp/apply page. Review within 48 hours — good people don't wait.",
        checklist: [
          "Review application in the Temp Pool tab",
          "Check: reliable transportation? availability matches our needs?",
          "Phone screen: 10 minutes — why temp work, any cleaning experience",
        ],
      },
      {
        title: "3. Background check (do it right)",
        detail:
          "Missouri has no ban-the-box law for private employers, but run checks after a conditional offer. FCRA order: standalone disclosure → written authorization → conditional offer → run the check.",
        checklist: [
          "Give the standalone background-check disclosure (separate document)",
          "Get signed written authorization",
          "Make the conditional offer ('pending background check')",
          "Run the check through our screening provider",
          "If something comes up: pre-adverse notice + copy of report + summary of rights, then waiting period before any final decision",
        ],
      },
      {
        title: "4. New-hire paperwork",
        detail:
          "No one works a shift until paperwork is done. No exceptions.",
        checklist: [
          "Form I-9 with ID verification (Section 2 within 3 business days)",
          "Federal W-4 and Missouri W-4",
          "Direct deposit authorization",
          "Report the new hire to Missouri within 20 days",
        ],
      },
      {
        title: "5. Orientation",
        detail:
          "30 minutes before the first shift. Temps who know what's expected don't guess.",
        checklist: [
          "Expectations: on time, dress code, phone policy, no-show = no more shifts",
          "Safety basics: wet-floor signs, chemical labels, lifting, PPE",
          "How clock-in/out works (GPS — clock in on site, not in the car)",
          "Who to call if they're running late or sick",
          "Where to find the handbook and who to report problems to",
        ],
      },
      {
        title: "6. Letting a temp go",
        detail:
          "Missouri is at-will. Document issues as they happen so terminations are never a surprise.",
        checklist: [
          "Document every incident: date, what happened, who saw it",
          "Verbal warning → written warning → removal from schedule",
          "Final pay: Missouri requires immediate pay on termination",
          "Collect any keys, badges, or equipment",
        ],
      },
    ],
  },
  {
    key: "field",
    icon: "🦺",
    title: "Field Ops — Running the Jobs",
    intro:
      "For managers and supervisors: getting temps to the right site, keeping them safe, and making sure the work is right.",
    steps: [
      {
        title: "1. Daily dispatch",
        detail:
          "Match the right temp to the right job — skills, location, and reliability matter more than who's available first.",
        checklist: [
          "Review today's jobs: site, start time, cleaners needed, scope",
          "Assign temps: consider experience, past performance, drive distance",
          "Confirm every temp the evening before (text: site, time, contact)",
          "Have 1–2 backup temps on standby for no-shows",
        ],
      },
      {
        title: "2. Pre-shift check",
        detail:
          "Before the temp leaves for the site, confirm they have everything.",
        checklist: [
          "Temp confirmed and knows the site address + start time",
          "Temp has the site contact's name and number",
          "Supplies and equipment loaded (if we provide them)",
          "PPE packed: gloves, safety glasses, vest — whatever the site needs",
        ],
      },
      {
        title: "3. Site safety check",
        detail:
          "Do this on the first visit to every new site, and spot-check after. If it's not safe, the temp doesn't work — period.",
        checklist: [
          "Walk the site: note wet floors, machinery, chemicals, heights",
          "PPE is worn correctly for the task",
          "Temp knows where emergency exits and first aid are",
          "Check in with the site contact on arrival",
          "Stop work immediately if conditions are unsafe — call the manager",
        ],
      },
      {
        title: "4. Quality spot-checks",
        detail:
          "Show up unannounced. Clients notice when we check our own work — and temps work better knowing we might.",
        checklist: [
          "Visit active sites unannounced at least weekly",
          "Check the scope list: restrooms, trash, floors, dusting — all done?",
          "Take photos of the finished work",
          "Give the temp feedback on the spot — good and bad",
          "Log the visit: date, site, temp, result",
        ],
      },
      {
        title: "5. End-of-shift verification",
        detail:
          "Confirm the hours and the work before the temp leaves the site.",
        checklist: [
          "Temp clocked out on site (GPS verifies location)",
          "Walk the scope: is everything on the list actually done?",
          "Get client sign-off or a quick 'all good' text when possible",
          "Note any issues for the next shift",
        ],
      },
      {
        title: "6. Incident reporting",
        detail:
          "Injuries, damage, or near-misses get documented the same day. Memories fade — paper doesn't.",
        checklist: [
          "Injury: get medical help first, then document everything",
          "Damage to client property: photos, what happened, notify the client same day",
          "Near-miss (almost got hurt): document it — that's how you prevent the real one",
          "Report workers' comp injuries to the carrier promptly",
        ],
      },
    ],
  },
  {
    key: "compliance",
    icon: "⚖️",
    title: "Compliance — Missouri Rules",
    intro:
      "The non-negotiables. When in doubt, ask the attorney — this is a checklist, not legal advice.",
    steps: [
      {
        title: "Always",
        checklist: [
          "Missouri minimum wage: $15.00/hr (2026) — no temp earns less",
          "Overtime: 1.5× pay over 40 hours/week, across all assignments",
          "Workers' comp: required — notify the carrier about temp staffing work",
          "New hires reported to Missouri within 20 days",
          "Temps are W-2 employees — never 1099 a temp",
          "Background checks follow FCRA: disclosure → authorization → offer → check",
          "Final pay immediately on termination (Missouri law)",
          "DBA filed with the Missouri Secretary of State for the temp name",
        ],
      },
    ],
  },
];

export default function Playbook() {
  const [dept, setDept] = useState("sales");
  const active = DEPARTMENTS.find((d) => d.key === dept);
  return (
    <section className="panel" style={{ padding: 24, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>📖 Operations Playbook</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Step-by-step for every department. Tap a step to open its checklist —
        check things off as you go. Your checkmarks save on this device.
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        {DEPARTMENTS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDept(d.key)}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: dept === d.key ? "var(--brand)" : "var(--bg)",
              color: dept === d.key ? "#fff" : "inherit",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {d.icon} {d.title.split(" — ")[0]}
          </button>
        ))}
      </div>
      {active && (
        <div>
          <h3 style={{ margin: "0 0 6px" }}>
            {active.icon} {active.title}
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{active.intro}</p>
          <div style={{ marginTop: 16 }}>
            {active.steps.map((s) => (
              <Step key={s.title} step={s} idPrefix={active.key} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
