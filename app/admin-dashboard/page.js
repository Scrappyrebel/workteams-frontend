import DashboardShell from "@/components/DashboardShell";

const items = [
  { icon: "🗓️", title: "Today’s Schedule", description: "See who is working, where they are assigned, and what needs attention." },
  { icon: "👤", title: "Employees", description: "Support employees and maintain the information admins need day to day." },
  { icon: "🔄", title: "Coverage", description: "Handle call-outs, open shifts, and schedule changes." },
  { icon: "📋", title: "Tasks", description: "Assign and review straightforward task lists and checklists." },
  { icon: "💬", title: "Communication", description: "Keep work-related updates in one practical place." },
  { icon: "📄", title: "Documents", description: "Make important forms, guides, and company documents easy to find." },
];

export default function AdminDashboardPage() {
  return (
    <DashboardShell
      eyebrow="ADMIN PORTAL"
      title="Admin Dashboard"
      description="Day-to-day workforce tools for administrators and managers."
      items={items}
      note="This placeholder dashboard gives Vercel a working route now and provides a stable place to connect future scheduling, people, and operations modules."
    />
  );
}
