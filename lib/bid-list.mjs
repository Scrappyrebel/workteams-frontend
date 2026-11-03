// Bids list helpers (Depth D-WT-25) — pure, display-only.
//
// Everything here derives from fields the list page already loads:
// the bids row (003 + 004 pricing + 007 frequency + 008 job type +
// 026 client_email) and the bid_items rows the page batch-loads to
// total line-item bids. Nothing here performs a write or a network
// call, or changes a stored value.
//
// There is NO stored total on a bid, in any migration. A bid's total
// has always been derived, the same way in the list page, the detail
// page, and the public proposal route:
//   line_items -> sum(quantity * unit_price) over bid_items
//   hourly     -> hours * hourly_rate
//   sqft       -> square_footage * rate_per_sqft
// A newly created line-item bid has no items yet, so its derived
// total is $0.00 — correct for an empty draft, but the list used to
// render it exactly like a real priced total. These helpers let the
// page say "no line items yet" honestly, and add the pipeline view
// (counts, basis-split values, follow-up aging, validity, search,
// sort) from the same already-loaded rows. The default sort
// ("newest") returns the rows in exactly the order the page's
// existing created_at-descending query delivered.

// Visits-per-month multipliers — the same table the page's own card
// labels and the bid detail page already use for the "~$/mo"
// estimate. A frequency not in this table has no monthly estimate.
export const BID_VISITS_PER_MONTH = {
  weekly: 4.33,
  "2x-week": 8.67,
  "3x-week": 13,
  "5x-week": 21.67,
  biweekly: 2.17,
  monthly: 1,
};

export function isLineItemBid(bid) {
  return (bid?.pricing_mode || "line_items") === "line_items";
}

// Per-bid line-item counts and summed totals from the rows the page
// already batch-loads (bid_id, quantity, unit_price). Counting the
// rows is what distinguishes "no line items yet" (count 0) from a
// bid whose items genuinely price to $0.00 (count > 0, total 0).
export function bidItemStats(items) {
  const stats = {};
  for (const it of items || []) {
    if (!it || it.bid_id == null) continue;
    const s = stats[it.bid_id] || (stats[it.bid_id] = { count: 0, total: 0 });
    s.count += 1;
    s.total += Number(it.quantity || 0) * Number(it.unit_price || 0);
  }
  return stats;
}

// True only for a line-item bid with no items at all. Hourly and
// sqft bids carry their price on the bid row itself, so they are
// never "empty" in this sense, whatever their total.
export function bidHasNoLineItems(bid) {
  if (!bid || !isLineItemBid(bid)) return false;
  return (bid.item_count || 0) === 0;
}

export function countBidsByStatus(bids) {
  const counts = { draft: 0, sent: 0, accepted: 0, declined: 0, all: 0 };
  for (const b of bids || []) {
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, b.status)) counts[b.status] += 1;
  }
  return counts;
}

// The price basis of a bid's derived total, in the page's own
// presentation: no frequency (or "one-time") means the total is the
// whole price; any other frequency means the total is per visit.
export function bidPriceBasis(bid) {
  if (!bid?.frequency || bid.frequency === "one-time") return "one_time";
  return "per_visit";
}

// Sum derived totals for a set of bids, split by basis so a
// per-visit amount is never added to a one-time amount without
// saying so. monthlyEstimate sums each recurring bid's own
// per-visit total x its frequency multiplier (the page's own "~"
// estimate); bids whose frequency has no known multiplier add to
// perVisit but not to monthlyEstimate.
export function sumBidValues(bids) {
  const out = { count: 0, oneTime: 0, perVisit: 0, monthlyEstimate: 0 };
  for (const b of bids || []) {
    out.count += 1;
    const total = Number(b.total || 0);
    if (bidPriceBasis(b) === "one_time") {
      out.oneTime += total;
    } else {
      out.perVisit += total;
      const vpm = BID_VISITS_PER_MONTH[b.frequency];
      if (vpm) out.monthlyEstimate += total * vpm;
    }
  }
  return out;
}

// Pipeline summary over every loaded bid: counts per status, the
// open pipeline (draft + sent) value, and the accepted value — each
// value split by price basis via sumBidValues.
export function summarizeBidPipeline(bids) {
  const rows = bids || [];
  const byStatus = (s) => rows.filter((b) => b.status === s);
  return {
    counts: countBidsByStatus(rows),
    open: sumBidValues([...byStatus("draft"), ...byStatus("sent")]),
    accepted: sumBidValues(byStatus("accepted")),
  };
}

// Validity of a bid against the company's today ("YYYY-MM-DD").
// valid_until and today are both date strings, so plain string
// comparison is the correct date comparison. "passed" matters
// because the public proposal route refuses a past-valid_until bid
// ("This proposal has expired.") — a sent bid past its date can no
// longer be accepted by the client.
export function bidValidity(bid, today) {
  if (!bid?.valid_until || !today) return "none";
  const until = String(bid.valid_until);
  if (until < today) return "passed";
  if (until === today) return "today";
  const days = Math.round((Date.parse(until) - Date.parse(today)) / 86400000);
  if (!Number.isNaN(days) && days <= 7) return "soon";
  return "ok";
}

export function bidValidityDaysLeft(bid, today) {
  if (!bid?.valid_until || !today) return null;
  const days = Math.round((Date.parse(String(bid.valid_until)) - Date.parse(today)) / 86400000);
  return Number.isNaN(days) ? null : days;
}

// Whole days between the bid's created date and today. Bids store
// no sent_at, so follow-up age is measured from created_at and the
// page labels it that way. created_at is a timestamp; its date part
// (first 10 chars) is compared date-to-date.
export function bidAgeDays(bid, today) {
  if (!bid?.created_at || !today) return null;
  const created = String(bid.created_at).slice(0, 10);
  const days = Math.round((Date.parse(today) - Date.parse(created)) / 86400000);
  return Number.isNaN(days) ? null : Math.max(0, days);
}

// Bids awaiting a client decision — status "sent" — oldest first,
// so the longest-waiting bid is the first follow-up. The loaded
// order is created_at descending, so oldest-first is its reverse;
// the sort is stable and never mutates the loaded array.
export function sentBidsAwaitingDecision(bids) {
  return (bids || [])
    .map((b, i) => ({ b, i }))
    .filter((x) => x.b.status === "sent")
    .sort((a, c) => {
      const da = String(a.b.created_at || "");
      const dc = String(c.b.created_at || "");
      if (da !== dc) return da < dc ? -1 : 1;
      return a.i - c.i;
    })
    .map((x) => x.b);
}

// Search over the text the card already shows: title, client name,
// location name, and the status label the page renders. An empty
// query returns the rows untouched.
export function searchBids(bids, query, statusLabels = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...(bids || [])];
  return (bids || []).filter((b) => {
    const haystack = [
      b.title || "",
      b.client_name || "",
      (b.locations && b.locations.name) || "",
      statusLabels[b.status] || b.status || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

// Sort choices for the list. "newest" is the page's existing order
// (the query's created_at descending) and is the default, so the
// page looks exactly as before until a manager picks another order.
// "valid_until": soonest first; bids with no date go last. Ties
// keep the loaded order (stable via the original index), and
// sorting never mutates the loaded array.
export function sortBids(bids, sortKey) {
  const rows = [...(bids || [])];
  if (!["oldest", "amount_desc", "amount_asc", "valid_until"].includes(sortKey)) return rows;
  return rows
    .map((b, i) => ({ b, i }))
    .sort((a, c) => {
      let cmp = 0;
      if (sortKey === "oldest") {
        const da = String(a.b.created_at || "");
        const dc = String(c.b.created_at || "");
        cmp = da < dc ? -1 : da > dc ? 1 : 0;
      } else if (sortKey === "amount_desc") {
        cmp = Number(c.b.total || 0) - Number(a.b.total || 0);
      } else if (sortKey === "amount_asc") {
        cmp = Number(a.b.total || 0) - Number(c.b.total || 0);
      } else {
        const da = a.b.valid_until ? String(a.b.valid_until) : null;
        const dc = c.b.valid_until ? String(c.b.valid_until) : null;
        if (da && dc) cmp = da < dc ? -1 : da > dc ? 1 : 0;
        else if (da) cmp = -1;
        else if (dc) cmp = 1;
      }
      return cmp !== 0 ? cmp : a.i - c.i;
    })
    .map((x) => x.b);
}
