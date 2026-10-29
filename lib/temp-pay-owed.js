// Temp pay-owed report math (pure — no I/O, unit-tested by
// scripts/check-temp-pay-owed.mjs).
//
// Source facts, from the migrations on main:
//  * temp_assignments.pay_rate_cents (046): the temp's hourly pay for ONE
//    assignment, in integer cents. NULL means "use the company's default
//    temp_hourly_pay" (temp_agency_config, numeric dollars, 043).
//  * temp_job_requests.hours_confirmed (047): the hours the CLIENT
//    confirmed for the whole job, recorded once per job through the
//    client portal. There is NO per-assignment hours field anywhere in
//    the temp schema, and time_entries carries no link to temp jobs
//    (company/member/location/shift only, 001) — confirmed job hours are
//    the only recorded "hours worked" the temp module has.
//  * The module's own booking math treats those hours as per-cleaner:
//    the client quote is cleaners_needed x hours x bill rate
//    (app/api/temp/book). So an accepted temp on a completed job is owed
//    assignment rate x confirmed hours — nothing else is computed, and
//    requested hours are NEVER used as worked hours.
//
// An assignment counts toward OWED only when ALL of these recorded facts
// hold: the temp accepted it (or it is marked completed), the job is
// marked completed, and the client confirmed hours. Anything else is
// listed as "awaiting" with its reason and NO dollar amount.
//
// All money is integer cents end-to-end; hours are carried as integer
// hundredths. Formatting happens only at display (fmtMoney / fmtHours).

export function hoursToHundredths(hours) {
  if (hours === null || hours === undefined || hours === "") return null;
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// The assignment's hourly rate in integer cents, plus where it came from.
// Returns { cents: null, source: "none" } when no rate is recorded at all.
export function rateCentsForAssignment(assignment, config) {
  if (assignment?.pay_rate_cents !== null && assignment?.pay_rate_cents !== undefined) {
    const cents = Number(assignment.pay_rate_cents);
    if (Number.isFinite(cents) && cents >= 0) {
      return { cents: Math.round(cents), source: "assignment" };
    }
  }
  if (config?.temp_hourly_pay !== null && config?.temp_hourly_pay !== undefined) {
    const dollars = Number(config.temp_hourly_pay);
    if (Number.isFinite(dollars) && dollars >= 0) {
      return { cents: Math.round(dollars * 100), source: "agency default" };
    }
  }
  return { cents: null, source: "none" };
}

// owed = rate x hours, in integer cents (hours arrive as hundredths).
export function owedCents(rateCents, hoursHundredths) {
  if (rateCents === null || hoursHundredths === null) return null;
  return Math.round((rateCents * hoursHundredths) / 100);
}

function effectiveDate(request) {
  if (request?.job_date) return String(request.job_date).slice(0, 10);
  if (request?.created_at) return String(request.created_at).slice(0, 10);
  return "";
}

// Classify one assignment against its job request.
// Returns { kind: "payable" } | { kind: "awaiting", reason } |
//         { kind: "excluded", reason } (declined / no-show: owed nothing,
//         never listed as awaiting).
export function classifyAssignment(assignment, request) {
  const status = assignment?.status || "";
  if (status === "declined" || status === "no_show") {
    return { kind: "excluded", reason: status === "no_show" ? "no-show" : "declined" };
  }
  if (status !== "accepted" && status !== "completed") {
    return { kind: "awaiting", reason: "Offer not accepted yet" };
  }
  if (!request || request.status !== "completed") {
    return { kind: "awaiting", reason: "Job not marked completed" };
  }
  if (hoursToHundredths(request.hours_confirmed) === null) {
    return { kind: "awaiting", reason: "Client hasn't confirmed hours yet" };
  }
  return { kind: "payable" };
}

// Build the whole report for a date range (inclusive, YYYY-MM-DD strings,
// matched against the job's date — job_date, falling back to the date the
// request was created).
export function buildTempPayOwed({ assignments, requests, members, config, start, end }) {
  const requestById = new Map((requests || []).map((r) => [r.id, r]));
  const memberById = new Map((members || []).map((m) => [m.id, m]));

  const rows = [];
  let excludedCount = 0;
  for (const a of assignments || []) {
    const request = requestById.get(a.job_request_id);
    if (!request) continue;
    const date = effectiveDate(request);
    if (start && date < start) continue;
    if (end && date > end) continue;

    const cls = classifyAssignment(a, request);
    if (cls.kind === "excluded") {
      excludedCount += 1;
      continue;
    }
    const rate = rateCentsForAssignment(a, config);
    const confirmedHundredths = hoursToHundredths(request.hours_confirmed);
    const payable = cls.kind === "payable" && rate.cents !== null;
    rows.push({
      assignmentId: a.id,
      memberId: a.member_id,
      memberName: memberById.get(a.member_id)?.display_name || "Temp",
      memberEmail: memberById.get(a.member_id)?.email || "",
      client: request.customer_name || "",
      serviceType: request.service_type || "",
      date,
      assignmentStatus: a.status,
      requestStatus: request.status,
      rateCents: rate.cents,
      rateSource: rate.source,
      hoursHundredths: payable ? confirmedHundredths : null,
      hoursRequested: request.hours_requested ?? null,
      hoursConfirmed: request.hours_confirmed ?? null,
      owedCents: payable ? owedCents(rate.cents, confirmedHundredths) : null,
      payable,
      reason: payable
        ? ""
        : cls.kind === "awaiting"
          ? cls.reason
          : "No pay rate recorded for this assignment",
    });
  }

  rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const perTempMap = new Map();
  const awaiting = [];
  for (const row of rows) {
    if (row.payable) {
      if (!perTempMap.has(row.memberId)) {
        perTempMap.set(row.memberId, {
          memberId: row.memberId,
          memberName: row.memberName,
          memberEmail: row.memberEmail,
          totalCents: 0,
          totalHoursHundredths: 0,
          assignments: 0,
          details: [],
        });
      }
      const t = perTempMap.get(row.memberId);
      t.totalCents += row.owedCents;
      t.totalHoursHundredths += row.hoursHundredths;
      t.assignments += 1;
      t.details.push(row);
    } else {
      awaiting.push(row);
    }
  }

  const perTemp = [...perTempMap.values()].sort((a, b) =>
    a.memberName.localeCompare(b.memberName)
  );
  return {
    perTemp,
    awaiting,
    excludedCount,
    grandTotalCents: perTemp.reduce((s, t) => s + t.totalCents, 0),
  };
}

// Merge recorded payments (temp_payments rows, migration 081) into a
// report built by buildTempPayOwed. Payments are recorded facts: an
// ACTIVE (non-voided) payment reduces what is still owed on its
// assignment by exactly its stored amount — paid figures are never
// recomputed from rates or hours, so a later rate/hours correction
// changes what is owed, never what the ledger says was paid. Voided
// payments stay in the per-assignment history (with their void record)
// and count toward nothing. The awaiting/excluded sections are not
// touched: a payment can only exist against a payable assignment (the
// 081 guard enforces the same facts classifyAssignment checks).
export function applyTempPayments(report, payments) {
  const byAssignment = new Map();
  for (const p of payments || []) {
    if (!p || !p.assignment_id) continue;
    if (!byAssignment.has(p.assignment_id)) byAssignment.set(p.assignment_id, []);
    byAssignment.get(p.assignment_id).push(p);
  }
  for (const rows of byAssignment.values()) {
    rows.sort((x, y) => {
      const dx = String(x.payment_date || "");
      const dy = String(y.payment_date || "");
      if (dx !== dy) return dx < dy ? -1 : 1;
      const cx = String(x.created_at || "");
      const cy = String(y.created_at || "");
      return cx < cy ? -1 : cx > cy ? 1 : 0;
    });
  }

  let grandPaidCents = 0;
  let grandBalanceCents = 0;
  const perTemp = (report?.perTemp || []).map((t) => {
    let paidCents = 0;
    const details = t.details.map((d) => {
      const rows = byAssignment.get(d.assignmentId) || [];
      const activePaid = rows.reduce(
        (s, p) => (p.voided_at ? s : s + (Number(p.amount_cents) || 0)),
        0
      );
      paidCents += activePaid;
      return {
        ...d,
        payments: rows,
        paidCents: activePaid,
        balanceCents: d.owedCents - activePaid,
        paidInFull: activePaid >= d.owedCents,
      };
    });
    const balanceCents = t.totalCents - paidCents;
    grandPaidCents += paidCents;
    grandBalanceCents += balanceCents;
    return { ...t, details, paidCents, balanceCents };
  });

  return { ...report, perTemp, grandPaidCents, grandBalanceCents };
}

// Display-only formatting. Money is integer cents everywhere else.
export function fmtMoney(cents) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function fmtHours(hundredths) {
  if (hundredths === null || hundredths === undefined) return "—";
  return (hundredths / 100).toFixed(2);
}
