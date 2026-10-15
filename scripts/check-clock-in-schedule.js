// Fail the WorkTeams build if anyone's schedule can authorize a different
// logged-in worker, or the manager exception loses authentication/audit trail.
const fs = require("node:fs");
const read = (p) => fs.readFileSync(p, "utf8");
const server = read("app/api/time/clock-in/route.js");
const page = read("app/app/[companyId]/time/page.js");
const manager = read("app/api/time/manager-clock/route.js");
const acknowledge = read("app/api/emergency/acknowledge/route.js");

const checks = [
  [acknowledge.includes('return NextResponse.json({ ok: true, acknowledged: true })') &&
   !acknowledge.includes('.from("time_entries")') &&
   !acknowledge.includes("Auto clock-in: emergency response") &&
   !acknowledge.includes("autoClockedIn:"),
   "Acknowledging any alert must never create an unscheduled time entry."],
  [acknowledge.includes('const user = await authedUser(req)') &&
   acknowledge.includes('.eq("company_id", companyId)') &&
   acknowledge.includes('.eq("user_id", user.id)'),
   "Acknowledgement must remain scoped to the authenticated member and company."],
  [server.includes('.eq("member_id", member.id)') && server.includes('.eq("company_id", companyId)') &&
   server.includes('.eq("location_id", locationId)') && server.includes('.in("shift_date", [yesterdayStr, todayStr])'),
   "Normal clock-in must match the signed-in member, company, location, and workday."],
  [server.indexOf("if (!shift)") < server.indexOf('.from("time_entries")\n      .insert({') &&
   server.includes("shift_id: shift.id"), "Reject unscheduled clock-in before inserting and link the assigned shift atomically."],
  [!server.includes("Auto-link to today's shift") && !server.includes("entry.shift_id = shift.id"),
   "No retroactive shift matching after an unauthorized clock-in."],
  [server.includes("if (shiftError)") && server.includes("status: 503"),
   "Clock-in fails closed when schedule authorization is unavailable."],
  [page.includes('.eq("member_id", member.id)') &&
   page.includes('setMyShifts(valid)') &&
   page.includes('locations.filter((l) => myShifts.some') &&
   page.includes("No shift assigned to your account today"),
   "Phone offers only the signed-in member's own scheduled locations."],
  [page.includes("disabled={busy || shiftLoading || !!shiftError || !locationId") &&
   page.includes('!myShifts.some((s) => s.location_id === locationId)'),
   "Phone prevents unscheduled or uncertain clock-ins."],
  [manager.includes("await authedUser(req)") &&
   manager.includes('.eq("user_id", user.id)') &&
   !manager.includes("actor_member_id") &&
   manager.includes('["owner", "admin", "manager"]'),
   "Manager override must authenticate logged-in owner/admin, not trust a forged actor ID."],
  [manager.includes('explanation.length < 3') &&
   manager.includes("Unscheduled clock-in APPROVED by") &&
   manager.includes("upload_pending: true"),
   "Manager override requires reason and preserves missing proof for review."],
  [page.includes("MANAGER OVERRIDE: Clock this person in") &&
   page.includes('Authorization: `Bearer ${session.access_token}`') &&
   page.includes("Why are you authorizing this unscheduled clock-in?"),
   "Owner/manager must deliberately and securely authorize exceptional clock-in."],
  [server.includes('chooseAssignedShift(memberShifts, now, new Set(), company?.timezone || "America/Chicago")') &&
   server.includes('.in("shift_date", [yesterdayStr, todayStr])') &&
   !server.includes("const shift = (memberShifts || []).find("),
   "Clock-in uses the nearest eligible shift and handles overnight shifts without selecting the first shift of the day."],
];
const failures = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
if (failures.length) {
  console.error("WorkTeams clock-in schedule regression failures:");
  failures.forEach((x) => console.error("- " + x));
  process.exit(1);
}
console.log("All WorkTeams individual shift clock-in and manager override regression guards passed.");
