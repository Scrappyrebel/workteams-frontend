// Built-in starter forms for the Documents & Forms library (D-WT-58).
//
// These are the paper forms WorkTeams' work already implies — the same
// jobs the app's Walkthroughs, Inspections, Emergency and Supplies
// sections do on screen, in a fillable/printable form for the truck,
// the site office, or a customer who wants paper. They are part of the
// app itself: no database row, no upload, available to every company
// the day the section ships. A filled form can be printed or saved as
// a PDF from the browser and then uploaded back into the library.
//
// Field types: text, textarea, number, date, select (with options),
// checkbox. Keep every starter self-contained on this list — the form
// page renders any entry from these definitions alone.

export const STARTER_FORMS = [
  {
    key: "incident-report",
    title: "Incident Report",
    category: "safety",
    description:
      "Record an injury, near miss, property damage, or safety concern at a job site. Fill it in the same day it happens.",
    fields: [
      { name: "date", label: "Date of incident", type: "date" },
      { name: "time", label: "Time of incident", type: "text" },
      { name: "location", label: "Location / site", type: "text" },
      { name: "reported_by", label: "Reported by", type: "text" },
      { name: "people_involved", label: "People involved", type: "textarea" },
      {
        name: "kind",
        label: "Type of incident",
        type: "select",
        options: ["Injury", "Near miss", "Property damage", "Chemical spill or exposure", "Vehicle", "Other"],
      },
      { name: "what_happened", label: "What happened", type: "textarea" },
      { name: "injuries", label: "Injuries or damage", type: "textarea" },
      { name: "first_aid", label: "First aid or treatment given", type: "textarea" },
      { name: "witnesses", label: "Witnesses (names and phone numbers)", type: "textarea" },
      { name: "follow_up", label: "Follow-up needed", type: "textarea" },
      { name: "manager_notified", label: "Manager notified", type: "checkbox" },
    ],
  },
  {
    key: "supply-request",
    title: "Supply Request",
    category: "operations",
    description:
      "Ask for cleaning supplies, chemicals, paper goods, or equipment for a site. Matches the Supplies section's items.",
    fields: [
      { name: "requested_by", label: "Requested by", type: "text" },
      { name: "location", label: "Location / site", type: "text" },
      { name: "date_needed", label: "Date needed by", type: "date" },
      { name: "items", label: "Items and quantities", type: "textarea" },
      {
        name: "urgency",
        label: "Urgency",
        type: "select",
        // Wendy's three levels (walkthrough 2026-11-19, #33) — the
        // same levels the Inventory page's Restock requests use.
        options: [
          "Urgent — OUT of it, need it ASAP (someone brings it that evening)",
          "Running low — needed within the next couple of days",
          "Low — at least a week of runway left",
        ],
      },
      { name: "notes", label: "Notes (brand, size, or safety requirements)", type: "textarea" },
    ],
  },
  {
    key: "walkthrough-form",
    title: "Walkthrough Form",
    category: "customers",
    description:
      "Paper walkthrough for a prospective customer's site — the same information the Walkthroughs section captures on screen.",
    fields: [
      { name: "customer", label: "Customer / business name", type: "text" },
      { name: "contact", label: "Contact name and phone", type: "text" },
      { name: "address", label: "Site address", type: "text" },
      { name: "date", label: "Walkthrough date", type: "date" },
      { name: "square_feet", label: "Approximate square feet", type: "number" },
      { name: "areas", label: "Areas to clean (offices, restrooms, floors, glass)", type: "textarea" },
      { name: "frequency", label: "Service frequency requested", type: "text" },
      { name: "access", label: "Access, keys, and alarm notes (no codes on paper)", type: "textarea" },
      { name: "special", label: "Special conditions or exclusions", type: "textarea" },
      { name: "walked_by", label: "Walked by", type: "text" },
    ],
  },
  {
    key: "inspection-form",
    title: "Inspection Form",
    category: "inspections",
    description:
      "Paper quality inspection for a cleaned site — mirrors the Inspections section for sites checked without a device.",
    fields: [
      { name: "location", label: "Location / site", type: "text" },
      { name: "date", label: "Inspection date", type: "date" },
      { name: "inspector", label: "Inspector", type: "text" },
      { name: "restrooms", label: "Restrooms — rating and notes", type: "textarea" },
      { name: "floors", label: "Floors — rating and notes", type: "textarea" },
      { name: "trash", label: "Trash and recycling — rating and notes", type: "textarea" },
      { name: "glass", label: "Glass and touchpoints — rating and notes", type: "textarea" },
      { name: "supplies", label: "Supplies stocked — rating and notes", type: "textarea" },
      { name: "corrections", label: "Corrections needed and by when", type: "textarea" },
      { name: "overall", label: "Overall result", type: "select", options: ["Pass", "Pass with corrections", "Fail — re-clean required"] },
    ],
  },
  // Everyday forms (Wendy, walkthrough 2026-11-19, #18): the basic
  // paperwork a cleaning company reaches for week in, week out — not
  // just incident reports. Same self-contained shape as the originals.
  {
    key: "time-off-request",
    title: "Time Off Request",
    category: "operations",
    description:
      "Ask for days off. Fill it in as early as you can — time off is approved in the order requests come in, and your manager answers on this form.",
    fields: [
      { name: "requested_by", label: "Your name", type: "text" },
      { name: "date_from", label: "First day off", type: "date" },
      { name: "date_to", label: "Last day off", type: "date" },
      { name: "reason", label: "Reason (optional)", type: "textarea" },
      { name: "covering", label: "Who could cover your shifts, if you know", type: "textarea" },
      { name: "manager_decision", label: "Manager decision", type: "select", options: ["Approved", "Denied", "Pending"] },
      { name: "manager_notes", label: "Manager notes", type: "textarea" },
    ],
  },
  {
    key: "end-of-shift-report",
    title: "End-of-Shift Report",
    category: "operations",
    description:
      "The paper twin of the shift book: what got cleaned, what you found, and what the next person needs to know, left at the end of a shift.",
    fields: [
      { name: "date", label: "Date", type: "date" },
      { name: "location", label: "Location / site", type: "text" },
      { name: "cleaned_by", label: "Cleaned by", type: "text" },
      { name: "areas_completed", label: "Areas completed", type: "textarea" },
      { name: "issues", label: "Issues found (damage, leaks, anything broken or unusual)", type: "textarea" },
      { name: "supplies", label: "Supplies used or running low", type: "textarea" },
      { name: "notes_next", label: "Notes for the next person", type: "textarea" },
      { name: "secured", label: "Building locked and alarm set when I left", type: "checkbox" },
    ],
  },
  {
    key: "key-sign-out-log",
    title: "Key Sign-Out Log",
    category: "operations",
    description:
      "Track site keys and fobs: who took them, when, and when they came back. One line per key, every time it changes hands.",
    fields: [
      { name: "location", label: "Location / site", type: "text" },
      { name: "key_description", label: "Key or fob (label or number on it)", type: "text" },
      { name: "taken_by", label: "Taken by", type: "text" },
      { name: "date_out", label: "Date taken", type: "date" },
      { name: "date_back", label: "Date returned", type: "date" },
      { name: "returned", label: "Returned and checked back in", type: "checkbox" },
      { name: "notes", label: "Notes (never write alarm or door codes here)", type: "textarea" },
    ],
  },
  {
    key: "customer-feedback",
    title: "Customer Feedback",
    category: "customers",
    description:
      "Hand to a customer or fill in from a call: how the cleaning went and what to do better. Anything marked for follow-up goes to a manager the same day.",
    fields: [
      { name: "customer", label: "Customer / business name", type: "text" },
      { name: "location", label: "Location / site", type: "text" },
      { name: "date", label: "Date", type: "date" },
      { name: "rating", label: "Overall, how did we do?", type: "select", options: ["Excellent", "Good", "Fair", "Poor"] },
      { name: "went_well", label: "What went well", type: "textarea" },
      { name: "improve", label: "What should we do better", type: "textarea" },
      { name: "follow_up", label: "Please follow up with me", type: "checkbox" },
      { name: "contact", label: "Best phone or email for the follow-up", type: "text" },
    ],
  },
  {
    key: "new-customer-information",
    title: "New Customer Information",
    category: "customers",
    description:
      "Set up a new cleaning customer: who they are, where the work is, and how the service runs. Access details only — never write alarm or door codes on this form.",
    fields: [
      { name: "customer", label: "Customer / business name", type: "text" },
      { name: "contact", label: "Main contact (name, phone, email)", type: "textarea" },
      { name: "billing", label: "Billing contact and address, if different", type: "textarea" },
      { name: "address", label: "Service address", type: "text" },
      { name: "frequency", label: "Service frequency and days", type: "text" },
      { name: "start_date", label: "First service date", type: "date" },
      { name: "access", label: "How the crew gets in (keys held, where to park, where supplies are kept — no codes)", type: "textarea" },
      { name: "special", label: "Special instructions or areas to skip", type: "textarea" },
    ],
  },
];

export function starterFormByKey(key) {
  return STARTER_FORMS.find((f) => f.key === key) || null;
}
