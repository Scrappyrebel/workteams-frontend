import Link from "next/link";

export default function DashboardShell({ eyebrow, title, description, items, note }) {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="back-link" href="/">← WorkTeams home</Link>
        <div className="header-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      <section className="dashboard-grid">
        {items.map((item) => (
          <article className="dashboard-card" key={item.title}>
            <div className="icon-badge" aria-hidden="true">{item.icon}</div>
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
            <span className="coming-soon">Coming next</span>
          </article>
        ))}
      </section>

      <section className="dashboard-note panel">
        <strong>Current build status</strong>
        <p>{note}</p>
      </section>
    </main>
  );
}
