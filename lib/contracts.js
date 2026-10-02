// Client service contract generator for WorkTeams.
// Standard clauses are baked in: yearly rate increase, holiday schedule,
// and severe weather policy. Per-visit pricing only — never flat rate.

export const MAJOR_HOLIDAYS = [
  "New Year's Day (January 1)",
  "Memorial Day (last Monday of May)",
  "Independence Day (July 4)",
  "Labor Day (first Monday of September)",
  "Thanksgiving Day (fourth Thursday of November)",
  "Christmas Day (December 25)",
];

export function formatMoney(n) {
  if (n == null || n === "") return "—";
  return "$" + Number(n).toFixed(2);
}

function scopeLines(scope) {
  if (!Array.isArray(scope) || scope.length === 0) return "  (scope of work to be attached)";
  return scope
    .map((s) => {
      const task = typeof s === "string" ? s : s.task || "";
      const freq = typeof s === "object" && s.frequency ? ` (${s.frequency})` : "";
      return `  • ${task}${freq}`;
    })
    .join("\n");
}

// Builds the full contract terms text. `c` fields:
// companyName, clientName, locationName, scopeOfWork[], startDate, endDate,
// visitsPerWeek, pricePerVisit, yearlyIncreasePct, extraCleanPrice, heavyCleanPrice
export function buildContractText(c) {
  const increase = c.yearlyIncreasePct ?? 3;
  const perWeek = Number(c.visitsPerWeek) || 0;
  const holidayRule =
    perWeek >= 5
      ? "Because this agreement covers five (5) visits per week, the Client shall pay the full weekly rate for weeks containing a major holiday. No credit or discount applies for the holiday closure."
      : "Because this agreement covers fewer than five (5) visits per week, any visit falling on a major holiday will be rescheduled to an alternate day within the same week at no additional charge.";

  return `CLEANING SERVICE AGREEMENT

Provider: ${c.companyName || ""}
Client: ${c.clientName || ""}
Service location: ${c.locationName || ""}
Effective date: ${c.startDate || ""}
${c.endDate ? `End date: ${c.endDate}` : "Term: ongoing until cancelled with 30 days written notice."}

1. SCOPE OF WORK
The Provider agrees to perform the following services at the service location:
${scopeLines(c.scopeOfWork)}

2. SCHEDULE AND RATE
Service visits: ${perWeek > 0 ? perWeek + " per week" : "as scheduled"} at ${formatMoney(c.pricePerVisit)} per visit.
Billing is per visit. Work is never priced at a flat rate.

3. YEARLY RATE INCREASE
The per-visit rate shall increase by ${increase}% on each anniversary of the effective date above.
The Provider will notify the Client in writing at least 30 days before any increase takes effect.

4. HOLIDAYS
The Provider observes the following major holidays, on which no regular service is performed:
${MAJOR_HOLIDAYS.map((h) => `  • ${h}`).join("\n")}
${holidayRule}

5. SEVERE WEATHER
The Provider will not require its employees to work in severe weather conditions that could
put their lives in danger, including but not limited to snowstorms, ice storms, and tornadoes.
Ordinary rain or minor thunderstorms do not qualify. Any visit cancelled for severe weather
will be rescheduled to the nearest practical day at no additional charge.

6. EXTRA AND HEAVY CLEANS
The Client may request additional service at any time through the client portal:
  • Extra clean: ${formatMoney(c.extraCleanPrice)} per visit
  • Heavy clean: ${formatMoney(c.heavyCleanPrice)} per visit
Requested extra services are scheduled subject to availability and billed in addition to the
regular contract rate.

7. CONTACT
The Client may contact the Provider at any time through the client portal or by reaching out
directly. The Provider will respond to all inquiries promptly.

8. CANCELLATION
Either party may cancel this agreement with 30 days written notice.

By signing below, the Client agrees to these terms.

Client signature: ___________________________   Date: __________
Printed name: ___________________________`;
}
