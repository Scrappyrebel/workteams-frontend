import Link from "next/link";

const portals = [
  {
    href: "/owner-dashboard",
    title: "Owner Dashboard",
    description: "See the big picture, manage the team, locations, schedules, and company activity.",
  },
  {
    href: "/admin-dashboard",
    title: "Admin Dashboard",
    description: "Handle day-to-day scheduling, employee support, tasks, and operating details.",
  },
  {
    href: "/employee-app",
    title: "Employee App",
    description: "A simple mobile-friendly home for shifts, time clock, tasks, and team updates.",
  },
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <section className="hero panel">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">WT</div>
          <div>
            <p className="eyebrow">WORKTEAMS</p>
            <h1>Manage your team without needing an IT department.</h1>
          </div>
        </div>
        <p className="hero-copy">
          A straightforward workforce and operations app for small businesses. Start simple, then turn on only the tools your company needs.
        </p>
        <div className="status-pill">Foundation live • Ready for the next build phase</div>
      </section>

      <section className="portal-grid" aria-label="WorkTeams portals">
        {portals.map((portal) => (
          <Link className="portal-card" href={portal.href} key={portal.href}>
            <span className="card-kicker">Open portal</span>
            <h2>{portal.title}</h2>
            <p>{portal.description}</p>
            <span className="card-link">Continue →</span>
          </Link>
        ))}
      </section>

      <section className="panel foundation-panel">
        <div>
          <p className="eyebrow">INITIAL FOUNDATION</p>
          <h2>Built to grow in manageable steps.</h2>
        </div>
        <div className="chip-row">
          <span>Employees</span>
          <span>Schedules</span>
          <span>Time Clock</span>
          <span>Attendance</span>
          <span>Locations</span>
          <span>Tasks</span>
          <span>Training</span>
          <span>Documents</span>
          <span>Communication</span>
        </div>
      </section>
    </main>
  );
}
