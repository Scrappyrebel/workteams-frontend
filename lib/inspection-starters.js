// Inspection starters: ready-made section plans for the inspection types a
// cleaning company actually runs. A starter pre-fills section names one at a
// time in the create flow, with the checklist items to focus on and a short
// "look for" note per section. It never pre-fills scores, checklist passes,
// notes, or photos — those are always the inspector's own entries, made on
// site. Copying a previous inspection works the same way (names + order only).
//
// The checklist strings below MUST match CHECKLIST in
// app/app/[companyId]/inspections/page.js and inspections/[id]/page.js —
// they are the values stored in inspection_items.checklist.

export const FLOORS = "Floors vacuumed / mopped — no debris or stains";
export const DUSTING = "Dusting — desks, shelves, blinds, vents";
export const TRASH = "Trash emptied — liners replaced";
export const GLASS = "Glass & mirrors — streak-free";
export const FIXTURES = "Restroom fixtures — toilets, sinks, mirrors cleaned";
export const STOCKING = "Restroom stocked — soap, paper towels, toilet paper";
export const KITCHEN = "Kitchen / break room — counters, sink, microwave wiped";
export const HIGH_TOUCH = "High-touch areas disinfected — handles, switches";

export const INSPECTION_STARTERS = [
  {
    id: "nightly",
    name: "Nightly Service Inspection",
    blurb:
      "The standard quality walk after a regular nightly clean — entry, work areas, restrooms, kitchen, and the closing checks.",
    sections: [
      {
        name: "Entry & Lobby",
        focus: [FLOORS, GLASS, HIGH_TOUCH],
        lookFor: "Door glass and handles, entry mat, grit tracked in from outside, lobby trash.",
      },
      {
        name: "Offices & Workstations",
        focus: [DUSTING, TRASH, FLOORS],
        lookFor: "Desk and shelf dust, missed trash cans, carpet spots, chairs left out of place.",
      },
      {
        name: "Restrooms",
        focus: [FIXTURES, STOCKING, FLOORS],
        lookFor: "Bowls, urinals and sinks; soap, towel and paper stock; floor corners and around fixture bases; odor.",
      },
      {
        name: "Kitchen / Break Room",
        focus: [KITCHEN, TRASH, FLOORS],
        lookFor: "Counters and sink, microwave interior, trash odor and liner change, floor under the tables.",
      },
      {
        name: "Conference Rooms",
        focus: [DUSTING, GLASS, FLOORS],
        lookFor: "Table surface and chairs pushed in, glass and whiteboards, credenza dust, carpet edges.",
      },
      {
        name: "Hallways, Stairs & Elevators",
        focus: [FLOORS, HIGH_TOUCH],
        lookFor: "Handrails and elevator buttons, stair treads and landings, buildup in corners.",
      },
      {
        name: "Janitor Closet & Trash Out",
        focus: [TRASH, HIGH_TOUCH],
        lookFor: "Closet left tidy, supplies restocked for the next visit, mop sink rinsed, dumpster area clean with lids closed.",
      },
    ],
  },
  {
    id: "restroom",
    name: "Restroom-Focused Inspection",
    blurb:
      "A deep check of restrooms only — fixtures, stocking, floors, mirrors, and the detail work customers notice first.",
    sections: [
      {
        name: "Fixtures — Toilets, Urinals & Sinks",
        focus: [FIXTURES, HIGH_TOUCH],
        lookFor: "Bowl and urinal scale, flush handles, faucet chrome, sink basins and counters, splash zones on the walls.",
      },
      {
        name: "Stocking & Dispensers",
        focus: [STOCKING],
        lookFor: "Every dispenser filled and working — soap, towels, tissue, seat covers; spare stock stored neatly.",
      },
      {
        name: "Floors, Baseboards & Drains",
        focus: [FLOORS],
        lookFor: "Corners and fixture bases, grout lines, floor-drain odor and standing water.",
      },
      {
        name: "Mirrors, Glass & Chrome",
        focus: [GLASS, FIXTURES],
        lookFor: "Mirror streaks and spots, chrome polish, light fixtures and any bulbs out.",
      },
      {
        name: "Partitions, Walls & Vents",
        focus: [DUSTING, HIGH_TOUCH],
        lookFor: "Partition dust and marks, grab bars wiped down, vent dust, high dusting above the stalls.",
      },
    ],
  },
  {
    id: "floorcare",
    name: "Floor-Care Inspection",
    blurb:
      "Floors only — vacuum and mop quality, edges and corners, carpet spots, and the transition areas that show wear first.",
    sections: [
      {
        name: "Entry & High-Traffic Areas",
        focus: [FLOORS],
        lookFor: "Tracked-in grit, mat edges, wear patterns at doorways, salt or mud residue in season.",
      },
      {
        name: "Hard Floors — Mop Quality & Edges",
        focus: [FLOORS],
        lookFor: "Edge and corner buildup, mop streaks, under furniture and along baseboards.",
      },
      {
        name: "Carpet — Vacuuming & Spot Check",
        focus: [FLOORS],
        lookFor: "Missed lanes along walls, visible spots and stains to flag for extraction, entry matting.",
      },
      {
        name: "Restroom & Kitchen Floors",
        focus: [FLOORS, FIXTURES],
        lookFor: "Corners and fixture bases, greasy film near kitchen equipment, grout condition.",
      },
      {
        name: "Stairs, Mats & Transitions",
        focus: [FLOORS, HIGH_TOUCH],
        lookFor: "Stair treads and nosings, mats curling or bunching, threshold strips between floor types.",
      },
    ],
  },
  {
    id: "final",
    name: "Move-Out / Post-Construction Final",
    blurb:
      "The final walk before handing a space back — construction dust, detail cleaning, and touch-ups, room by room.",
    sections: [
      {
        name: "Kitchen & Appliances",
        focus: [KITCHEN, HIGH_TOUCH],
        lookFor: "Appliance interiors and exteriors, cabinet faces and interiors, sink and faucet detail, construction film on surfaces.",
      },
      {
        name: "Bathrooms — Final Detail",
        focus: [FIXTURES, GLASS],
        lookFor: "Fixture polish, mirror and glass detail, tub and shower residue, dust on exhaust fans and light bars.",
      },
      {
        name: "Rooms — Dust & Detail",
        focus: [DUSTING, GLASS],
        lookFor: "High dusting — tops of doors, vents, blinds, ceiling corners; window sills and tracks; outlet and switch plates.",
      },
      {
        name: "Floors — Final Pass",
        focus: [FLOORS],
        lookFor: "Construction dust in corners and closets, paint specks, adhesive residue, final vacuum and mop finish.",
      },
      {
        name: "Glass, Windows & Tracks",
        focus: [GLASS],
        lookFor: "Sticker and label residue, paint overspray, dirt in the tracks, streak check against the light.",
      },
      {
        name: "Final Walk & Touch-Up List",
        focus: [HIGH_TOUCH, TRASH],
        lookFor: "Leftover debris and supplies removed, every room re-checked against the scope, touch-ups noted before sign-off.",
      },
    ],
  },
  {
    id: "walkthrough",
    name: "Client Walkthrough (with the Customer)",
    blurb:
      "A joint walk with the client — first impressions, each service area, and a shared follow-up list before you leave.",
    sections: [
      {
        name: "Entry & First Impressions",
        focus: [GLASS, FLOORS, HIGH_TOUCH],
        lookFor: "What the client's visitors see first — door glass, entry floor, reception surfaces.",
      },
      {
        name: "Work Areas",
        focus: [DUSTING, TRASH, FLOORS],
        lookFor: "Desks and shared surfaces, trash service, carpet and floor condition — ask what bothers them most here.",
      },
      {
        name: "Restrooms",
        focus: [FIXTURES, STOCKING],
        lookFor: "Fixture condition, stocking levels, odor — the area clients judge hardest.",
      },
      {
        name: "Kitchen / Break Room",
        focus: [KITCHEN, TRASH],
        lookFor: "Counters, appliances, trash and recycling — confirm together what is and isn't in scope.",
      },
      {
        name: "Overall & Follow-Ups",
        focus: [HIGH_TOUCH, DUSTING],
        lookFor: "Agree the top fixes before the next visit and write them in the notes — what, and by when.",
      },
    ],
  },
];

export function starterById(id) {
  return INSPECTION_STARTERS.find((s) => s.id === id) || null;
}
