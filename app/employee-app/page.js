import Link from "next/link";

const quickActions = [
  { icon: "⏱️", title: "Clock In / Out", description: "Time clock will connect here." },
  { icon: "📅", title: "My Schedule", description: "Upcoming shifts will appear here." },
  { icon: "✅", title: "My Tasks", description: "Assigned tasks and checklists will live here." },
  { icon: "📚", title: "Training", description: "Simple assigned training and job guides." },
];

export default function EmployeeAppPage() {
  return (
    <main className="employee-shell">
      <header className="employee-header">
        <Link className="back-link light" href="/">← WorkTeams</Link>
        <p className="eyebrow light-text">EMPLOYEE APP</p>
        <h1>Good to see you.</h1>
        <p>Your workday essentials will stay simple and easy to reach from here.</p>
      </header>

      <section className="employee-content">
        <article className="next-shift-card">
          <div>
            <span className="card-kicker">Next shift</span>
            <h2>No shift data connected yet</h2>
            <p>Once Supabase is connected, the employee’s next assigned shift will show here automatically.</p>
          </div>
          <span className="shift-badge">Setup phase</span>
        </article>

        <section className="employee-actions" aria-label="Employee quick actions">
          {quickActions.map((action) => (
            <article className="employee-action" key={action.title}>
              <span className="employee-icon" aria-hidden="true">{action.icon}</span>
              <div>
                <h2>{action.title}</h2>
                <p>{action.description}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
