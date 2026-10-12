import Link from "next/link";

export const metadata = { title: "Booking confirmed | Temp Staffing" };

export default function TempBookSuccess() {
  return (
    <main className="site-shell">
      <section className="panel" style={{ padding: 36, textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
        <h1>You're booked</h1>
        <p style={{ color: "var(--muted)" }}>
          Payment received. We're matching background-checked cleaners to your
          job now and will confirm your crew by email shortly.
        </p>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Need them long-term? Ask about temp-to-hire after 90 days — or 6
          months for ongoing placements.
        </p>
        <Link href="/temp" className="btn-ghost" style={{ padding: "10px 24px" }}>
          Back to temp staffing
        </Link>
      </section>
    </main>
  );
}
