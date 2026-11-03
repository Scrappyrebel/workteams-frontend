// Manager-side Client Portal depth helpers (D-WT-32).
// Pure and fail-soft: these helpers only reshape facts the manager page has
// ALREADY loaded through its existing company-scoped, manager-gated reads
// (the recent portal_messages window and the identity-contacts RPC payload).
// They perform no reads or writes of their own, invent no dates, and treat
// any missing or malformed stored value as "not available" (null / zero
// counts over the loaded window) rather than guessing.

// A stored timestamp is only ever shown when it parses as a real date.
// Pre-migration payloads simply omit the newer keys, which yields null here
// and the page renders exactly as it did before.
export function storedDateString(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

// Per-location activity over the request window the page already loaded.
// "open" mirrors the inbox lib's own rule: anything not resolved is open.
// latestAt is the newest loaded request's created_at for that location.
export function locationRequestActivity(messages, locationId) {
  const items = (Array.isArray(messages) ? messages : []).filter(
    (m) => m && locationId && m.location_id === locationId
  );
  let latestAt = null;
  for (const m of items) {
    const at = storedDateString(m.created_at);
    if (at && (latestAt === null || Date.parse(at) > Date.parse(latestAt))) {
      latestAt = at;
    }
  }
  return {
    recent: items.length,
    unread: items.filter((m) => !m.read_at).length,
    open: items.filter((m) => m.customer_status !== "resolved").length,
    latestAt,
  };
}

// Access dates the identity-contacts RPC stores but, before migration 095,
// did not return: when the contact was approved, and when a verified
// customer account was linked (the claim date). Both stay null when the
// payload does not carry them, so older payloads render unchanged.
export function contactAccessDates(contact) {
  if (!contact || typeof contact !== "object") {
    return { approvedAt: null, accountLinkedAt: null };
  }
  return {
    approvedAt: storedDateString(contact.approved_at),
    accountLinkedAt: storedDateString(contact.account_linked_at),
  };
}
