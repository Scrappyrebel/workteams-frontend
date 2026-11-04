// Guard for the legal-pages verification pass (D-WT-09).
// VERIFICATION ONLY: this pass changed NO legal text — legal
// text is attorney-gated, flagged and never rewritten here.
// What the verification found on current main (2026-11-04):
//   CONSISTENT — all three documents name the same provider
//   (Ridgefront Tech LLC, a Missouri limited liability company)
//   and print the identical contact block (same street address)
//   and the same pending-attorney-review footer.
//   INCONSISTENT — the contact EMAIL differs: Terms and Privacy
//   print lillybsjanitorial@gmail.com; the EULA prints
//   Ridgefronttech@gmail.com. Which address is canonical is a
//   decision for Wendy and her attorney (register item 23,
//   D-WT-09 D1) — this guard pins the AS-FOUND state exactly,
//   so any future edit to these facts fails CI until a human
//   reviews it, in either direction.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}

const pages = {
  terms: readFileSync("app/terms/page.js", "utf8"),
  privacy: readFileSync("app/privacy/page.js", "utf8"),
  eula: readFileSync("app/eula/page.js", "utf8"),
};

for (const [name, text] of Object.entries(pages)) {
  check(
    text.includes("Ridgefront Tech LLC"),
    name + ": provider entity is Ridgefront Tech LLC"
  );
  check(
    text.includes("29108 State Highway Y, Cabin A"),
    name + ": contact street address matches the other documents"
  );
  check(
    text.includes("Jonesburg, MO 63351"),
    name + ": contact city/state/ZIP matches the other documents"
  );
  check(
    text.includes("pending review by a licensed Missouri business attorney"),
    name + ": the pending-attorney-review footer is present"
  );
}

// As-found contact emails — pinned exactly, including the known
// inconsistency, so a change in EITHER direction is a reviewed
// event, never a silent drift.
check(
  pages.terms.includes('href="mailto:lillybsjanitorial@gmail.com"'),
  "terms: contact email as found (lillybsjanitorial@gmail.com)"
);
check(
  pages.privacy.includes('href="mailto:lillybsjanitorial@gmail.com"'),
  "privacy: contact email as found (lillybsjanitorial@gmail.com)"
);
check(
  pages.eula.includes('href="mailto:Ridgefronttech@gmail.com"'),
  "eula: contact email as found (Ridgefronttech@gmail.com) — differs from terms/privacy; see register D-WT-09 D1"
);

// As-found version stamps (each document amends on its own
// schedule; the dates are pinned so a stamp change is visible).
check(pages.terms.includes("Last updated: October 7, 2026"), "terms: version stamp as found");
check(pages.privacy.includes("Last updated: October 20, 2026"), "privacy: version stamp as found");
check(pages.eula.includes("Last updated: October 26, 2026"), "eula: version stamp as found");

if (failures > 0) {
  console.error("check-legal-pages-consistency: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-legal-pages-consistency: OK");
