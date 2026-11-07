// Field-sales walkthrough templates for the temp staffing service.
//
// One tap-through template per industry line — office, factory,
// cleaning — because what a client expects from temps is different
// in each, and the salesperson checks it off on the tablet while
// walking the site. The walkthrough ends in a quote worksheet so the
// client can be quoted on the spot.
//
// The FACTORY template's safety section is not sales decoration: it
// is the agency's OSHA inquire-and-verify record (Temporary Worker
// Initiative) — proof the agency looked at the workplace before
// sending people into it. Complete it on every factory walkthrough.

export const TEMP_WALKTHROUGH_TEMPLATES = [
  {
    lane: "cleaning",
    label: "Cleaning / Janitorial",
    openingLine:
      "Thanks for walking the site with me — I'll note exactly what your crew expects, and I can give you a rate before I leave.",
    sections: [
      {
        title: "The site",
        items: [
          "Square footage and number of buildings / floors",
          "Restrooms — count and condition",
          "Floors: hard surface, carpet, or mixed",
          "Trash and recycling volume",
          "Entry, alarm, and lock-up routine",
          "Where supplies and equipment are stored",
        ],
      },
      {
        title: "The work expected",
        items: [
          "Nights per week and service window",
          "Tasks per visit (restrooms, trash, floors, glass, dusting)",
          "Deep-clean or project work (strip & wax, carpet extraction)",
          "Supplies and equipment: client provides or agency provides",
          "Quality checks — how the client inspects the work",
        ],
      },
      {
        title: "The temps",
        items: [
          "How many temps per visit",
          "Working alone on site, or with a site lead",
          "Background check or site clearance required",
          "Start date and how long the need runs",
        ],
      },
    ],
  },
  {
    lane: "office",
    label: "Office / Administrative",
    openingLine:
      "Thanks for making time — I'll map the exact desk work your team needs covered, and I can give you a rate before I leave.",
    sections: [
      {
        title: "The workplace",
        items: [
          "Department and team the temp joins",
          "Workstation, computer, and phone set up for the temp",
          "Systems the temp will touch (email, CRM, accounting, files)",
          "Dress code and visitor / security routine",
          "Who the temp reports to day to day",
        ],
      },
      {
        title: "The work expected",
        items: [
          "Positions and headcount (reception, data entry, admin, accounting help)",
          "Software that must already be known — Excel, Word, Outlook, QuickBooks",
          "Typing speed the work honestly needs",
          "Phones / front-desk coverage expectations",
          "Recurring deadlines or busy seasons to cover",
        ],
      },
      {
        title: "The temps",
        items: [
          "Skills tests the client wants on file (Excel / Word proficiency, typing)",
          "Schedule: full-time, part-time, or fill-in days",
          "Start date and how long the need runs",
          "Temp-to-hire possibility, and on what timeline",
        ],
      },
    ],
  },
  {
    lane: "manufacturing",
    label: "Factory / Manufacturing",
    openingLine:
      "Thanks for the walkthrough — I'll map the jobs and check the safety picture myself, and I can give you a rate before I leave.",
    sections: [
      {
        title: "The plant",
        items: [
          "Departments and lines the temps will work",
          "Shifts, shift differentials, and overtime pattern",
          "Break, locker, and PPE station setup",
          "Who directs the temps' work on the floor",
          "Parking, entrance, and badge routine",
        ],
      },
      {
        title: "The work expected",
        items: [
          "Positions and headcount per shift (assembly, packaging, machine help, warehouse)",
          "Physical demands — lifting weight, standing, pace",
          "Forklift work involved, and on which equipment",
          "Aptitude screening wanted (sorting, piecework pace)",
          "Steel-toe and dress requirements",
          "Start date and how long the need runs",
        ],
      },
      {
        title: "Safety verification — OSHA record",
        safety: true,
        items: [
          "Chemicals in use — HazCom program and safety data sheets located",
          "Lockout/tagout procedures in place for serviced equipment",
          "PPE provided by the host, and what each job requires",
          "Machine guarding in place on equipment temps will work near",
          "Site hazards walked and noted (forklift traffic, noise, heat, heights)",
          "Injury reporting: who records, who the agency calls, same day",
          "Site-specific training the host will give before the first shift",
        ],
      },
      {
        title: "On-site option (factory only)",
        items: [
          "Client asked about an on-site agency supervisor (their temps' boss on site) — note interest only; offered only where the agency has it switched on",
        ],
      },
    ],
  },
];

export const TEMP_WALKTHROUGH_BY_LANE = Object.fromEntries(
  TEMP_WALKTHROUGH_TEMPLATES.map((t) => [t.lane, t])
);
