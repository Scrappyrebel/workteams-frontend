import Link from "next/link";

export const metadata = {
  title: "Temp Cleaning Staffing | Lilly B's",
  description:
    "On-demand temp cleaners for commercial, residential, move in/out, construction cleanup, and long-term day janitorial. Temp-to-hire available.",
};

const SERVICES = [
  {
    key: "commercial",
    title: "Commercial Cleaning",
    text: "Temp cleaners for offices, retail, and facilities — one shift or ongoing coverage when your crew is short.",
  },
  {
    key: "residential",
    title: "Residential Cleaning",
    text: "Extra hands for homes: deep cleans, recurring help, or event turnover.",
  },
  {
    key: "move_in_out",
    title: "Move In / Move Out",
    text: "Fast, thorough turnover cleans between tenants — apartments, rentals, and homes.",
  },
  {
    key: "construction_cleanup",
    title: "New Build Construction Cleanup",
    text: "Post-construction dust, debris, and detail cleaning so new builds are move-in ready.",
  },
  {
    key: "day_janitorial",
    title: "Day Janitorial — Long Term",
    text: "Ongoing daytime janitorial for manufacturing facilities, warehouses, and plants. Staffing you can scale up or down.",
  },
];

export default function TempLanding() {
  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 36, textAlign: "center" }}>
        <p className="kicker">Temp Staffing</p>
        <h1 style={{ fontSize: 34, margin: "8px 0 12px" }}>
          Cleaners on demand, for as long as you need them
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: 640, margin: "0 auto 24px" }}>
          Tell us how many cleaners you need and for how long. Our vetted temp
          team shows up, clocks in, and gets it done — commercial, residential,
          move-outs, construction cleanup, and long-term day janitorial.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/temp/book" className="btn-primary" style={{ padding: "12px 28px" }}>
            Book cleaners
          </Link>
          <Link href="/temp/apply" className="btn-ghost" style={{ padding: "12px 28px" }}>
            Work as a temp
          </Link>
        </div>
      </section>

      <section className="panel" style={{ padding: 28, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>What we staff</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          {SERVICES.map((s) => (
            <div key={s.key} className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: "0 0 8px" }}>{s.title}</h3>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ padding: 28, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol style={{ lineHeight: 2, paddingLeft: 20 }}>
          <li>
            <strong>Request:</strong> pick your service, how many cleaners, and
            the schedule. Pay online — per cleaner, per hour, no flat-rate surprises.
          </li>
          <li>
            <strong>We staff it:</strong> background-checked temps are assigned
            to your job and clock in on arrival.
          </li>
          <li>
            <strong>Temp-to-hire:</strong> love your temp? Hire them directly
            after 90 days — or 6 months for long-term placements.
          </li>
        </ol>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Every temp passes a background check before their first job. You are
          billed only for hours worked, tracked by GPS-verified clock in/out.
        </p>
        <Link href="/temp/book" className="btn-primary" style={{ padding: "12px 28px" }}>
          Get started
        </Link>
      </section>
    </main>
  );
}
