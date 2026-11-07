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
        options: ["Routine — next scheduled delivery", "Soon — this week", "Urgent — site is out"],
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
];

export function starterFormByKey(key) {
  return STARTER_FORMS.find((f) => f.key === key) || null;
}
