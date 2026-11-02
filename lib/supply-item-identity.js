// Supply item identity fields (migration 087): vendor, SKU and the one
// location an item's stock is kept at. Pure, fail-soft helpers for the
// supplies page — until migration 087 runs the columns do not exist,
// the page behaves exactly as it always has, and these helpers simply
// describe empty values. Nothing here touches quantity, movements,
// check-outs, condition or restock behaviour, and nothing here carries
// a cost: who can see costs does not change with this upgrade.

// The three additive columns, in select order.
export const SUPPLY_IDENTITY_COLUMNS = "vendor, sku, location_id";

// Trim a form value to a stored value: blank becomes null, exactly the
// way the supplies form already stores category and notes.
export function identityStoredValue(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

// The identity slice of a save payload, built from the item form.
export function buildIdentityPayload(form) {
  return {
    vendor: identityStoredValue(form?.vendor),
    sku: identityStoredValue(form?.sku),
    location_id: form?.location_id ? String(form.location_id) : null,
  };
}

// True when the person actually typed or picked something in the new
// fields. Used by the save ladder: entered values are never silently
// dropped — if the columns are not there yet, the save says so instead.
export function identityValuesEntered(form) {
  const payload = buildIdentityPayload(form);
  return Boolean(payload.vendor || payload.sku || payload.location_id);
}

// True when an error is the "these columns do not exist yet" shape:
// Postgres 42703 (undefined column), PostgREST PGRST204 (column not in
// the schema cache), or a message naming one of the identity columns
// as missing. Any other error is a real error and is reported as-is.
export function isMissingIdentityColumnError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42703" || code === "PGRST204") return true;
  const message = String(error.message || "");
  return (
    /(vendor|sku|location_id)/i.test(message) &&
    /(column|schema cache|does not exist|not found)/i.test(message)
  );
}

// The parts of an item's identity line, in display order. Each part is
// present only when the value is stored, so a pre-087 item (or one with
// nothing entered) yields an empty list and the card renders exactly as
// before. locationName is the resolved name of item.location_id, or
// null when it cannot be resolved (the line then just omits it).
export function identityLineParts(item, locationName) {
  const parts = [];
  const sku = identityStoredValue(item?.sku);
  if (sku) parts.push(`SKU ${sku}`);
  const vendor = identityStoredValue(item?.vendor);
  if (vendor) parts.push(`Vendor: ${vendor}`);
  if (item?.location_id && locationName) parts.push(`📍 Stocked at: ${locationName}`);
  return parts;
}

// Case-insensitive search over everything written on an item card:
// name, category, notes, SKU, vendor and the stocked-at location name.
// An empty query matches every item, so an untouched search box leaves
// the list exactly as it has always been.
export function supplyItemMatchesSearch(item, locationName, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item?.name,
    item?.category,
    item?.notes,
    item?.sku,
    item?.vendor,
    locationName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
