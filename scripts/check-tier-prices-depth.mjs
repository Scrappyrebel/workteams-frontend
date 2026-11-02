import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Tier Prices depth (D-WT-42 + D-WT-43) invariants:
// * Both catalog pages — the in-app "Tier Prices" tab
//   (app/app/[companyId]/tier-prices/page.js) and "Admin — tier prices"
//   (app/admin/tiers/page.js) — render ONE shared editor,
//   components/TierPricesEditor.js, and save through ONE route,
//   app/api/admin/tier-prices/route.js. This guard pins that sharing:
//   a fix to the editor covers both pages; splitting them silently
//   would reopen the "same function, two standards" gap.
// * Before this pass the editor was three bare number inputs: no
//   per-tier context, no separation between the saved price and the
//   value being typed, and a save confirmation ("Saved at …") that
//   never said WHAT changed and never read stored values back.
// * Everything added is display around the EXISTING save path:
//   - "Prices currently saved" read-out from the load snapshot, with a
//     per-tier "last changed" line from product_tiers.updated_at when
//     that tolerant read succeeds (any failure hides the line — a
//     missing timestamp must never block or misstate a price).
//   - Each tier's own tagline + feature list from lib/tiers.js shown
//     beside its input, so the price being edited is a known product.
//   - An unsaved-changes note driven by numeric comparison against
//     the saved snapshot.
//   - After a successful save, a before → after read-out of the tiers
//     that changed (or an explicit "No prices changed" line), under
//     the pre-existing saved-at line, which stays verbatim.
//   - A plain note of the save mechanics the route already implements
//     (Stripe price created first, display updated after; running
//     subscriptions keep their Stripe price).
// * Prices are customer-commitment data: the additions display ONLY
//   stored values and the tiers' existing definitions. No pricing or
//   terms text is created or rewritten here (attorney-gated), and no
//   stored value's meaning changes.
// * A full change HISTORY (who/from/to/when per change) needs storage
//   that does not exist — it is a Wendy decision item (D1 in the PR),
//   deliberately NOT invented here; this guard pins that no history
//   table or audit write sneaks into the editor or the route.

const editor = readFileSync("components/TierPricesEditor.js", "utf8");
const tabPage = readFileSync("app/app/[companyId]/tier-prices/page.js", "utf8");
const adminPage = readFileSync("app/admin/tiers/page.js", "utf8");
const route = readFileSync("app/api/admin/tier-prices/route.js", "utf8");

// --- Both pages still share the one editor, intros byte-preserved ---
assert.ok(
  tabPage.includes("TierPricesEditor") && adminPage.includes("TierPricesEditor"),
  "both tier-price pages must render the shared TierPricesEditor"
);
assert.ok(
  tabPage.includes("These are the monthly prices every company sees on the Plans page."),
  "the in-app Tier Prices intro must stay verbatim"
);
assert.ok(
  adminPage.includes("These show on the landing page and the Plans page."),
  "the Admin tier prices intro must stay verbatim"
);
for (const page of [tabPage, adminPage]) {
  assert.ok(
    page.includes("Changes go live immediately."),
    "each page's go-live line must stay verbatim"
  );
}

// --- The saved-values read-out + last-changed line exist and stay honest ---
assert.ok(
  editor.includes("Prices currently saved") && editor.includes("savedPrices"),
  "the editor must show a saved-prices read-out from the load snapshot"
);
assert.ok(
  editor.includes('select("tier, updated_at")') && editor.includes("lastChanged"),
  "the last-changed line must come from product_tiers.updated_at"
);
assert.ok(
  editor.includes("Last changed") && editor.includes("savedUpdated"),
  "the last-changed line must render only from the tolerant updated_at read"
);

// --- Per-tier context comes from the tiers' own definitions ---
assert.ok(
  editor.includes("TIERS[key].tagline") && editor.includes("TIERS[key].features"),
  "each input must carry its tier's own tagline and feature list from lib/tiers.js"
);

// --- Unsaved-changes + before/after confirmation ---
assert.ok(
  editor.includes("You have unsaved changes") && editor.includes("hasUnsaved"),
  "an unsaved-changes note must appear when an input differs from the saved snapshot"
);
assert.ok(
  editor.includes("No prices changed") && editor.includes("lastSaveChanges"),
  "a successful save must read out what changed, or say plainly that nothing did"
);
assert.ok(
  editor.includes("Subscriptions already running keep the Stripe price they started on"),
  "the page must state that running subscriptions keep their price (route behavior)"
);

// --- The existing save path is pinned, NOT changed ---
assert.ok(
  editor.includes('fetch("/api/admin/tier-prices"') &&
    editor.includes('method: "POST"') &&
    editor.includes("JSON.stringify({ prices })"),
  "saves must still POST { prices } to /api/admin/tier-prices"
);
assert.ok(
  editor.includes('alert("Could not save: " + failed)'),
  "save failures must still surface the server's error via the existing alert"
);
assert.ok(
  editor.includes("Saved at {savedAt}. New prices show on the Plans page right away."),
  "the pre-existing saved-at confirmation line must stay verbatim"
);
assert.ok(
  editor.includes('type="number"') && editor.includes('min="0"') && editor.includes('step="1"'),
  "the price inputs keep their existing type/min/step"
);
assert.ok(
  editor.includes("Save prices") && editor.includes('"Saving…"'),
  "the save button and its saving state stay"
);

// --- Route invariants: Stripe first, then the database; owner-only ---
assert.ok(
  route.indexOf("stripe.prices.create") !== -1 &&
    route.indexOf("stripe.prices.create") < route.indexOf("stripe_price_id: created.id"),
  "the route must still create the Stripe Price before pointing the row at it"
);
assert.ok(
  route.includes("PRODUCT_OWNER_EMAIL") && route.includes("callerIsProductOwner"),
  "the route must stay product-owner-only via PRODUCT_OWNER_EMAIL"
);
assert.ok(
  !editor.includes("tier_price_history") && !route.includes("tier_price_history"),
  "no price-history storage may be invented without Wendy's migration decision (D1)"
);

console.log("Tier prices depth guards passed.");
