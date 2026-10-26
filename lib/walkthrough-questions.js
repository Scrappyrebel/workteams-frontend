// Wendy's new-client question set, built into the walkthrough flow.
// The wording below is hers — from "Walkthrough-and-Phone-Questions"
// (Part 1 phone questions, Part 2 on-site room-by-room questions, and
// the before-you-leave checklist). Do not paraphrase these labels.
//
// Storage (migration 067):
//   walkthroughs.intake  (jsonb) — Part 1 answers + intake header fields
//   walkthroughs.answers (jsonb) — Part 2 building-level answers + checklist
//   walkthroughs.scheduled_at / meet_contact / entry_notes — the appointment
//   walkthrough_areas.floor_type, toilets_count, urinals_count, sinks_count
//   walkthrough_areas.details (jsonb) — Part 2 per-area answers
//
// The client probes for the 067 columns before using any of this, so the
// app keeps working unchanged until the migration has been run.

// ---------- Part 1 header (top of Wendy's phone sheet) ----------

export const INTAKE_FIELDS = [
  { key: "business_name", label: "Business Name", type: "text" },
  { key: "contact_person", label: "Contact Person", type: "text" },
  { key: "contact_phone", label: "Phone", type: "tel" },
  { key: "contact_email", label: "Email", type: "email" },
  { key: "facility_address", label: "Facility Address", type: "text" },
  { key: "intake_date", label: "Date", type: "date" },
];

// ---------- Part 1 — phone questions ----------
// "PART 1 — PHONE QUESTIONS (ask before agreeing to a walkthrough)"
// Question 17 (schedule the walkthrough) is captured by the appointment
// columns scheduled_at / meet_contact / entry_notes, not by this list.

export const PHONE_QUESTIONS = [
  {
    key: "facility_type",
    label: "What kind of facility is it? (office, medical, bank, church, retail, warehouse, other)",
    type: "select",
    options: ["office", "medical", "bank", "church", "retail", "warehouse", "other"],
  },
  { key: "estimated_size", label: "About how big is the space? (square feet, or number of offices / rooms)", type: "text" },
  { key: "occupant_count", label: "How many people work there on a normal day?", type: "text", inputMode: "numeric" },
  { key: "current_cleaner", label: "Do you have a cleaning company now? What made you start looking?", type: "textarea" },
  { key: "biggest_pain", label: "What is NOT getting done that bothers you most?", type: "textarea" },
  { key: "areas_needed", label: "Which areas need cleaning? (offices, restrooms, lobby, kitchen / break room, other)", type: "text" },
  { key: "restroom_count", label: "How many restrooms are there?", type: "text", inputMode: "numeric" },
  { key: "nights_per_week", label: "How many nights a week are you thinking?", type: "text" },
  { key: "access_hours", label: "What hours can cleaners be in the building? (evenings, after close, weekends)", type: "text" },
  {
    key: "cleaning_supplies",
    label: "Who supplies the cleaning supplies — you, or the cleaning company?",
    type: "select",
    options: ["You (the client)", "Us (the cleaning company)", "Not decided yet"],
  },
  {
    key: "restroom_supplies",
    label: "Who supplies restroom paper, soap, and trash liners?",
    type: "select",
    options: ["You (the client)", "Us (the cleaning company)", "Not decided yet"],
  },
  { key: "special_upfront", label: "Anything special we should know up front? (alarm system, locked / secure areas, special floors, events)", type: "textarea" },
  { key: "decision_maker", label: "Are you the person who decides, or does someone else approve it?", type: "text" },
  { key: "other_quotes", label: "Are you getting other quotes? When do you plan to decide?", type: "text" },
  { key: "start_hoped", label: "When are you hoping to start service?", type: "text" },
  { key: "proposal_email", label: "What is the best email to send the proposal to?", type: "email" },
];

// ---------- Part 2 — building-level question groups ----------
// Answered once per walkthrough (not per room). "Total square footage"
// from "The Building" is covered by the measured areas, so it is not
// repeated here.

export const BUILDING_SECTIONS = [
  {
    title: "The Building",
    fields: [
      { key: "floors_stairs", label: "How many floors? Stairs or elevator?", type: "text" },
      { key: "dumpster_recycling", label: "Where is the dumpster? Is there recycling, and where does it go?", type: "textarea" },
      { key: "janitor_closet", label: "Is there a janitor closet? Where can we get water? Where do we store supplies and equipment?", type: "textarea" },
    ],
  },
  {
    title: "Access, Keys & Security",
    fields: [
      { key: "access_times", label: "What time can we get in, and what time do we need to be out?", type: "text" },
      { key: "entry_alarm", label: "How do we get in — key, code, card? Alarm: who shows us how it works?", type: "textarea" },
      { key: "crew_requirements", label: "Background checks or sign-in required for the crew?", type: "text" },
      { key: "after_hours_contact", label: "Who is the after-hours contact if something goes wrong? (name + phone)", type: "text" },
      { key: "crew_parking_entry", label: "Where should the crew park and enter?", type: "text" },
    ],
  },
  {
    title: "What Matters Most to Them",
    fields: [
      { key: "current_complaints", label: "Walk me through your complaints about the cleaning you have now.", type: "textarea" },
      { key: "top_priorities", label: "What are the 3 most important things for us to get right every time?", type: "textarea" },
      { key: "special_care", label: "Any rooms or areas that need extra disinfecting or special care?", type: "textarea" },
      { key: "busy_seasons", label: "Busy seasons, events, or times the schedule changes?", type: "text" },
    ],
  },
  {
    title: "The Business Side",
    fields: [
      { key: "nights_best", label: "How many nights a week, and which nights work best?", type: "text" },
      { key: "start_date", label: "When do you want to start?", type: "text" },
      { key: "signer_invoice", label: "Who signs the agreement? Who gets the invoice, and what email?", type: "text" },
      { key: "coi_needed", label: "Do you need a certificate of insurance (COI) from us?", type: "text" },
      { key: "decision_proposal", label: "When will you decide? Proposal promised by (date):", type: "text" },
    ],
  },
];

// ---------- Before You Leave — Checklist ----------
// Stored in walkthroughs.answers under these keys (true/false), with the
// proposal date and the catch-all kept as text under their own keys.

export const LEAVE_CHECKLIST = [
  { key: "leave_every_room_measured", label: "Every room measured" },
  { key: "leave_dumpster_found", label: "Dumpster found" },
  { key: "leave_closet_found", label: "Janitor closet found" },
  { key: "leave_entry_explained", label: "Entry / keys / alarm explained" },
  { key: "leave_photos_taken", label: "Photos taken (with permission)" },
  { key: "leave_proposal_promised", label: "Proposal date promised:", textKey: "leave_proposal_date", textPlaceholder: "Date promised" },
];

export const LEAVE_TEXT_FIELDS = [
  { key: "leave_anything_else", label: "Anything else they asked for:" },
];

// ---------- Part 2 — per-area question groups ----------
// Answered per walkthrough area, stored in walkthrough_areas.details.
// Floor type itself is the walkthrough_areas.floor_type column and the
// restroom fixture counts are their own columns, so they are not here.

export const FLOOR_TYPES = ["Carpet", "Tile", "Hardwood", "Concrete", "Vinyl", "Mixed", "Other"];

export const AREA_SECTIONS = [
  {
    title: "Offices, Desks & Glass",
    fields: [
      { key: "offices_workstations", label: "How many offices and workstations?", type: "text" },
      { key: "desk_policy", label: "Desks: do we clean desks, only empty desks, or just empty the trash? What about personal items?", type: "textarea" },
      { key: "dusting_scope", label: "Dusting: how far do we go — desks, ledges, blinds, vents, high dusting?", type: "textarea" },
      { key: "glass_windows", label: "Glass and windows: entrance glass, office glass, partitions — and how often?", type: "textarea" },
      { key: "fragile_offlimits", label: "Anything fragile, valuable, or off-limits we should never touch?", type: "textarea" },
    ],
  },
  {
    title: "Restrooms",
    fields: [
      { key: "showers_lockers", label: "Showers or locker areas?", type: "text" },
      { key: "restocking_stock", label: "Restocking paper, soap, and liners — ours to do? Who buys the stock?", type: "text" },
      { key: "restroom_problems", label: "Any restroom problems now? (odors, buildup, dispensers that don’t work)", type: "textarea" },
    ],
  },
  {
    title: "Kitchen / Break Room",
    fields: [
      { key: "appliances_inside", label: "Appliances: microwave, refrigerator — inside cleaning included? How often?", type: "textarea" },
      { key: "dishes_sinks", label: "Dishes and sinks — ours to wash, or employees’ own?", type: "text" },
      { key: "coffee_area", label: "Coffee area — wipe down only, or clean the machines too?", type: "text" },
    ],
  },
  {
    title: "Floors",
    fields: [
      { key: "floor_work_future", label: "Carpet cleaning or floor stripping / waxing wanted, or in the future?", type: "text" },
      { key: "entrance_mats", label: "Entrance mats — theirs or ours? Winter salt and mud trouble spots?", type: "textarea" },
    ],
  },
  {
    title: "Trash",
    fields: [
      { key: "trash_setup", label: "Trash at every desk, or central cans only?", type: "text" },
      { key: "recycling_shred", label: "Recycling and shred bins — do we empty those too?", type: "text" },
    ],
  },
];

// ---------- helpers ----------

export function sectionFields(sections) {
  return (sections || []).flatMap((s) => s.fields || []);
}

// [label, value] pairs for every answered field, in definition order.
export function answeredPairs(defs, answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  return (defs || [])
    .filter((d) => {
      const v = a[d.key];
      return v !== undefined && v !== null && String(v).trim() !== "";
    })
    .map((d) => [d.label, String(a[d.key]).trim()]);
}

// True when a PostgREST/Supabase error means the 067 schema (a column or
// the walkthrough_photos table) is not there yet — the migration simply
// has not been run. Used for probe-and-fallback so nobody gets locked out.
export function isMissingSchemaError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;
  const msg = String(error.message || "");
  return /column .* does not exist/i.test(msg) || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg);
}

// Clean an answers object before saving: drop empty strings so stored
// jsonb only holds real answers.
export function pruneAnswers(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === "boolean") out[k] = v;
    else if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = String(v).trim();
  }
  return out;
}
