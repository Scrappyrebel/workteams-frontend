import { readFileSync } from "node:fs";

const layout=readFileSync(new URL("../app/app/[companyId]/layout.js",import.meta.url),"utf8");
const schedule=readFileSync(new URL("../app/app/[companyId]/schedule/page.js",import.meta.url),"utf8");
const time=readFileSync(new URL("../app/app/[companyId]/time/page.js",import.meta.url),"utf8");
const team=readFileSync(new URL("../app/app/[companyId]/team/page.js",import.meta.url),"utf8");
const portal=readFileSync(new URL("../app/app/[companyId]/client-portal/page.js",import.meta.url),"utf8");
const gps=readFileSync(new URL("../lib/browser-geolocation.js",import.meta.url),"utf8");
const foundation=readFileSync(new URL("../supabase/001_foundation.sql",import.meta.url),"utf8");

const checks=[
  [
    layout.includes(".eq(\"company_id\", companyId)") &&
      layout.includes(".eq(\"user_id\", user.id)") &&
      layout.includes("No access to this company"),
    "Company routes must require a signed-in membership for the exact tenant."
  ],
  [
    foundation.includes("alter table companies enable row level security") &&
      foundation.includes("alter table company_members enable row level security") &&
      foundation.includes("alter table locations enable row level security") &&
      foundation.includes("alter table shifts enable row level security") &&
      foundation.includes("alter table time_entries enable row level security"),
    "Core WorkTeams tables must keep RLS enabled."
  ],
  [
    schedule.includes('.eq("company_id", company.id)') &&
      schedule.includes('.delete().eq("id", id).eq("company_id", company.id)'),
    "Scheduling reads and destructive mutations must remain company-scoped."
  ],
  [
    gps.includes("watchPosition") &&
      gps.includes("acceptableAccuracyMeters = 100") &&
      time.includes("getBestBrowserPosition") &&
      time.includes("pos.accuracy > 100"),
    "Geofenced clocking must use a best-reading GPS sample and reject weak readings."
  ],
  [
    time.includes('.eq("company_id", company.id)') &&
      time.includes('.eq("member_id", member.id)') &&
      time.includes("clock out"),
    "Clock-out updates must be constrained to the active company and employee."
  ],
  [
    portal.includes('.eq("company_id", company.id)') &&
      portal.includes('.delete().eq("id", id).eq("company_id", company.id)'),
    "Client portal links and revocation must remain tenant-scoped."
  ],
  [
    team.includes('.eq("company_id", company.id)') &&
      team.includes('.delete().eq("id", m.id).eq("company_id", company.id)') &&
      team.includes('.update({ role }).eq("id", m.id).eq("company_id", company.id)'),
    "Team administration must remain tenant-scoped."
  ],
  [
    ![layout,schedule,time,team,portal].some(source=>source.includes("Lilly B's")||source.includes("That's A Wrap")),
    "WorkTeams shared core must remain nationally reusable and not hard-code another tenant's brand."
  ]
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){
  console.error("WorkTeams platform protection guard failed:");
  failures.forEach(x=>console.error("- "+x));
  process.exit(1);
}
console.log("WorkTeams platform protection guard passed.");
