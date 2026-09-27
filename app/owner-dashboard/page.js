import DashboardShell from "@/components/DashboardShell";

const items = [
  { icon: "👥", title: "People", description: "Employees, managers, supervisors, roles, and company access." },
  { icon: "📅", title: "Scheduling", description: "See coverage, create shifts, and manage upcoming work." },
  { icon: "📍", title: "Locations", description: "Keep job sites and operating locations organized." },
  { icon: "⏱️", title: "Time & Attendance", description: "Review clock activity, attendance, and exceptions." },
  { icon: "✅", title: "Tasks & Checklists", description: "Standardize recurring work without overcomplicating it." },
  { icon: "📊", title: "Simple Reports", description: "A practical view of the information owners actually need." },
];

export default function OwnerDashboardPage() {
  return (
    <DashboardShell
      eyebrow="OWNER PORTAL"
      title="Owner Dashboard"
      description="A simple command center for the company without enterprise-level clutter."
      items={items}
      note="This route is live and deployable. Real company data and Supabase-powered features will be added in later phases."
    />
  );
}
