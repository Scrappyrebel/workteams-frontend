// Walkthroughs list helpers (Depth D-WT-27) — pure, display-only.
//
// Everything here derives from fields the list page already loads
// (005: name, notes, location_id, bid_id, locations(name), created_at;
// 067: scheduled_at, meet_contact, intake) plus the per-walkthrough
// area count the page already computes from walkthrough_areas.
// Nothing here performs a write or a network call, or changes a
// stored value.
//
// There is NO status column on walkthroughs (005 + 067 are the whole
// schema story), so the stage shown on the list is DERIVED from what
// is already recorded — a linked bid, the recorded areas, the
// appointment, the phone answers — and every stage carries the basis
// it was worked out from, stated in plain words on the card. It is a
// reading of the record, never a stored status and never a workflow:
// no stage can be set, moved, or saved from here.
//
// The client identity likewise comes only from what the phone intake
// already stored: intake.business_name / intake.contact_person
// (lib/walkthrough-questions INTAKE_FIELDS). The detail page's bid
// conversion reads the same field as the client name. Records made
// before migration 067 have no intake, so they honestly show no
// client line rather than a guessed one.

export function walkthroughIntake(walkthrough) {
  const intake = walkthrough ? walkthrough.intake : null;
  return intake && typeof intake === "object" && !Array.isArray(intake) ? intake : {};
}

function intakeText(walkthrough, key) {
  const v = walkthroughIntake(walkthrough)[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// The client as recorded on the phone intake, or null when the intake
// never recorded one.
export function walkthroughClientName(walkthrough) {
  return intakeText(walkthrough, "business_name");
}

export function walkthroughContactName(walkthrough) {
  return intakeText(walkthrough, "contact_person");
}

// How many phone/intake answers are actually recorded. Intake is
// pruned before saving (empty answers are dropped), so a stored key
// with a non-empty value is an answered question.
export function walkthroughPhoneAnswerCount(walkthrough) {
  let n = 0;
  for (const v of Object.values(walkthroughIntake(walkthrough))) {
    if (typeof v === "boolean") {
      if (v) n += 1;
    } else if (v !== undefined && v !== null && String(v).trim() !== "") {
      n += 1;
    }
  }
  return n;
}

// Derived pipeline stage, in pipeline order. Precedence is factual:
// a linked bid means the walkthrough already converted; recorded
// areas mean the building was walked; a future appointment means it
// is scheduled; a past appointment with nothing recorded is the
// follow-up case; phone answers alone mean intake has started.
// `now` is milliseconds since the epoch (the caller passes Date.now()).
export function walkthroughStage(walkthrough, now) {
  const w = walkthrough || {};
  const count = Number(w.count) || 0;
  const answers = walkthroughPhoneAnswerCount(w);
  if (w.bid_id) {
    return {
      key: "bid_linked",
      label: "Bid linked",
      basis: "A bid is linked to this walkthrough.",
    };
  }
  if (count > 0) {
    return {
      key: "walked",
      label: "Walked — no bid linked yet",
      basis: `${count} area${count === 1 ? "" : "s"} recorded; no bid linked yet.`,
    };
  }
  const when = w.scheduled_at ? Date.parse(w.scheduled_at) : NaN;
  if (!Number.isNaN(when)) {
    if (when >= (Number(now) || 0)) {
      return {
        key: "scheduled",
        label: "Scheduled",
        basis: "An appointment is set and no areas are recorded yet.",
      };
    }
    return {
      key: "appointment_passed",
      label: "Appointment passed — no areas yet",
      basis: "The appointment date has passed and no areas are recorded yet.",
    };
  }
  if (answers > 0) {
    return {
      key: "phone_intake",
      label: "Phone intake started",
      basis: `${answers} phone answer${answers === 1 ? "" : "s"} recorded; no appointment or areas yet.`,
    };
  }
  return {
    key: "new",
    label: "New",
    basis: "No phone answers, appointment, areas, or linked bid recorded yet.",
  };
}

export const WALKTHROUGH_STAGE_KEYS = [
  "bid_linked",
  "walked",
  "scheduled",
  "appointment_passed",
  "phone_intake",
  "new",
];

// Counts per derived stage over the loaded rows. followUp is the
// appointment-passed-with-nothing-recorded set — the records a
// manager most needs to chase.
export function countWalkthroughStages(walkthroughs, now) {
  const counts = {
    all: 0,
    bid_linked: 0,
    walked: 0,
    scheduled: 0,
    appointment_passed: 0,
    phone_intake: 0,
    new: 0,
    followUp: 0,
  };
  for (const w of walkthroughs || []) {
    counts.all += 1;
    const stage = walkthroughStage(w, now);
    counts[stage.key] += 1;
    if (stage.key === "appointment_passed") counts.followUp += 1;
  }
  return counts;
}

// Search over the text the record already carries: walkthrough name,
// location name, the recorded client and contact, who will meet us,
// notes, and the derived stage label. An empty query returns the
// rows untouched.
export function searchWalkthroughs(walkthroughs, query, now) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...(walkthroughs || [])];
  return (walkthroughs || []).filter((w) => {
    const haystack = [
      w.name || "",
      (w.locations && w.locations.name) || "",
      walkthroughClientName(w) || "",
      walkthroughContactName(w) || "",
      w.meet_contact || "",
      w.notes || "",
      walkthroughStage(w, now).label,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

// Stage filter for the list. "all" (or an unknown key) returns the
// rows untouched, in the page's existing created_at-descending order.
export function filterWalkthroughsByStage(walkthroughs, stageKey, now) {
  if (!WALKTHROUGH_STAGE_KEYS.includes(stageKey)) return [...(walkthroughs || [])];
  return (walkthroughs || []).filter((w) => walkthroughStage(w, now).key === stageKey);
}
