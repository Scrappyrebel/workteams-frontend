// Client service contract generator for WorkTeams.
// Standard clauses are baked in: yearly rate increase, holiday schedule,
// and severe weather policy. Per-visit pricing only — never flat rate.
//
// NOTE: This template is not legal advice. Have an attorney licensed in the
// client's state review it before using it with paying customers.

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
  if (!Array.isArray(scope) || scope.length === 0) return "  (scope of work to be attached as Exhibit A)";
  return scope
    .map((s, i) => {
      const task = typeof s === "string" ? s : s.task || "";
      const freq = typeof s === "object" && s.frequency ? ` — ${s.frequency}` : "";
      return `  ${i + 1}. ${task}${freq}`;
    })
    .join("\n");
}

// Builds the full contract text. `c` fields:
// companyName, clientName, locationName, scopeOfWork[], startDate, endDate,
// visitsPerWeek, pricePerVisit, yearlyIncreasePct, extraCleanPrice, heavyCleanPrice
export function buildContractText(c) {
  const increase = c.yearlyIncreasePct ?? 3;
  const perWeek = Number(c.visitsPerWeek) || 0;
  const termLine = c.endDate
    ? `The initial term of this Agreement shall run from the Effective Date through ${c.endDate} (the "Initial Term"), and shall thereafter renew automatically for successive one (1) month periods unless terminated in accordance with Article 14.`
    : `The term of this Agreement shall commence on the Effective Date and continue on a month-to-month basis until terminated in accordance with Article 14.`;
  const holidayRule =
    perWeek >= 5
      ? "Because this Agreement covers five (5) or more visits per week, the Client shall pay the full weekly rate for any week containing a Major Holiday. No credit, discount, or offset shall apply on account of the holiday closure."
      : "Because this Agreement covers fewer than five (5) visits per week, any visit falling on a Major Holiday shall be rescheduled to an alternate day within the same calendar week at no additional charge to the Client.";

  return `CLEANING SERVICE AGREEMENT

This Cleaning Service Agreement (this "Agreement") is entered into as of ${c.startDate || "[Effective Date]"} (the "Effective Date"), by and between:

  Provider:  ${c.companyName || "[Provider Name]"} ("Provider")
  Client:    ${c.clientName || "[Client Name]"} ("Client")

Provider and Client are each a "Party" and collectively the "Parties."

RECITALS

  WHEREAS, Provider is in the business of providing commercial cleaning services; and
  WHEREAS, Client desires to engage Provider to perform cleaning services at the Service Location (as defined below), and Provider desires to accept such engagement;

  NOW, THEREFORE, in consideration of the mutual covenants and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

ARTICLE 1 — SERVICES AND SERVICE LOCATION

  1.1  Engagement. Client hereby engages Provider, and Provider hereby accepts such engagement, to perform the cleaning services described in Article 2 (the "Services") at the following location (the "Service Location"):

       ${c.locationName || "[Service Location]"}

  1.2  Standard of Performance. Provider shall perform the Services in a professional and workmanlike manner, consistent with industry standards for commercial cleaning services.

ARTICLE 2 — SCOPE OF WORK

  2.1  The Services shall consist of the following tasks, attached hereto and incorporated by reference as Exhibit A:

${scopeLines(c.scopeOfWork)}

  2.2  Any work outside the scope described above shall be deemed Additional Services and shall be governed by Article 8.

ARTICLE 3 — SCHEDULE

  3.1  Provider shall perform the Services ${perWeek > 0 ? `${perWeek} time(s) per week` : "on the schedule mutually agreed by the Parties"}, at mutually agreed arrival windows. Time is of the essence with respect to scheduled visits.

ARTICLE 4 — COMPENSATION

  4.1  Per-Visit Rate. In consideration for the Services, Client shall pay Provider ${formatMoney(c.pricePerVisit)} per completed visit (the "Rate"). Compensation under this Agreement is assessed strictly on a per-visit basis; in no event shall the Services be priced at a flat rate.

  4.2  Invoicing and Payment. Provider shall invoice Client periodically for visits completed. All invoices are due and payable within thirty (30) days of receipt.

  4.3  Taxes. Client shall be responsible for any sales, use, or similar taxes arising from the Services, except for taxes based on Provider's net income.

ARTICLE 5 — ANNUAL RATE ADJUSTMENT

  5.1  The Rate shall increase by ${increase}% on each anniversary of the Effective Date. Provider shall notify Client in writing at least thirty (30) days before any such adjustment takes effect. The adjusted Rate shall apply to all visits occurring on or after the anniversary date.

ARTICLE 6 — HOLIDAYS

  6.1  Provider observes the following major holidays, on which no regular Services shall be performed (each, a "Major Holiday"):

${MAJOR_HOLIDAYS.map((h) => `       • ${h}`).join("\n")}

  6.2  ${holidayRule}

ARTICLE 7 — SEVERE WEATHER

  7.1  Provider shall not require or permit its employees to perform Services under severe weather conditions that could endanger human life, including but not limited to snowstorms, ice storms, blizzards, and tornadoes. Ordinary rain and minor thunderstorms do not constitute severe weather under this Article.

  7.2  Any visit cancelled due to severe weather shall be rescheduled to the nearest practicable day at no additional charge to Client, and no penalty shall accrue to either Party on account of such cancellation.

ARTICLE 8 — ADDITIONAL SERVICES

  8.1  Client may request additional cleaning services at any time through the client portal or by direct request to Provider, including:

       • Extra clean: ${formatMoney(c.extraCleanPrice)} per visit
       • Heavy clean: ${formatMoney(c.heavyCleanPrice)} per visit

  8.2  Additional Services shall be scheduled subject to availability, shall be billed in addition to the Rate, and shall otherwise be performed under the terms of this Agreement.

ARTICLE 9 — CLIENT OBLIGATIONS

  9.1  Client shall provide Provider with reasonable access to the Service Location during scheduled visits, including keys, access codes, or other means of entry as required.

  9.2  Client shall provide access to water, electricity, and other utilities reasonably necessary for performance of the Services, at no charge to Provider.

  9.3  Client shall promptly notify Provider of any hazardous conditions at the Service Location of which Client is aware.

  9.4  Consumable supplies — including but not limited to toilet paper, paper towels, hand soap, hand sanitizer, trash-can liners, and air fresheners — shall be supplied by Client at Client's sole expense. Provider does not supply restroom or kitchen consumables. Provider shall supply its own cleaning chemicals, disinfectants, mops, vacuums, and other cleaning equipment and supplies necessary to perform the Services.

ARTICLE 10 — INSURANCE

  10.1 Provider represents that it maintains, and shall maintain during the term of this Agreement, commercial general liability insurance in amounts customary for the services performed hereunder.

ARTICLE 11 — LIMITATION OF LIABILITY

  11.1 EXCEPT FOR A PARTY'S INDEMNIFICATION OBLIGATIONS OR WILLFUL MISCONDUCT, NEITHER PARTY'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL EXCEED THE AMOUNTS PAID OR PAYABLE BY CLIENT TO PROVIDER IN THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.

  11.2 IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

ARTICLE 12 — INDEMNIFICATION

  12.1 Each Party (the "Indemnifying Party") shall indemnify, defend, and hold harmless the other Party from and against any third-party claims arising from the Indemnifying Party's negligence or willful misconduct in connection with this Agreement.

ARTICLE 13 — CONFIDENTIALITY

  13.1 Provider shall keep confidential any non-public information of Client to which Provider gains access in connection with the Services, including access codes, alarm codes, and security procedures, and shall not disclose such information except as necessary to perform the Services.

ARTICLE 14 — TERM AND TERMINATION

  14.1 Term. ${termLine}

  14.2 Termination for Convenience. Either Party may terminate this Agreement for any reason upon thirty (30) days' prior written notice to the other Party.

  14.3 Termination for Cause. Either Party may terminate this Agreement immediately upon written notice if the other Party materially breaches this Agreement and fails to cure such breach within fifteen (15) days of receiving written notice thereof.

  14.4 Effect of Termination. Upon termination, Client shall pay Provider for all Services completed through the effective date of termination. Articles 11, 12, and 13 shall survive termination.

ARTICLE 15 — NOTICES

  15.1 All notices under this Agreement shall be in writing and shall be deemed given when delivered through the client portal, by email with confirmed receipt, or by nationally recognized overnight courier.

ARTICLE 16 — GOVERNING LAW

  16.1 This Agreement shall be governed by and construed in accordance with the laws of the state in which the Service Location is situated, without regard to its conflict-of-laws principles.

ARTICLE 17 — GENERAL PROVISIONS

  17.1 Entire Agreement. This Agreement, together with its exhibits, constitutes the entire agreement between the Parties with respect to the Services and supersedes all prior or contemporaneous understandings, whether written or oral.

  17.2 Amendments. This Agreement may not be amended except by a written instrument signed by both Parties.

  17.3 Severability. If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.

  17.4 Assignment. Neither Party may assign this Agreement without the prior written consent of the other Party, except to a successor in connection with a merger or sale of substantially all of its assets.

  17.5 Counterparts; Electronic Signatures. This Agreement may be executed in counterparts, each of which shall be deemed an original. Electronic signatures shall have the same force and effect as original signatures.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

PROVIDER:
${c.companyName || "[Provider Name]"}

Signature: ___________________________   Date: __________
Printed name: ___________________________
Title: ___________________________

CLIENT:
${c.clientName || "[Client Name]"}

Signature: ___________________________   Date: __________
Printed name: ___________________________
Title: ___________________________`;
}
