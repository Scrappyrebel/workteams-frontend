// At-a-glance summary for the authenticated customer portal
// (Depth D-WT-05). Pure helpers only: they summarize arrays that the
// portal's OWN already-scoped RPCs returned for ONE approved
// company + location. They never fetch, never widen scope, and never
// invent a figure: a section whose read failed or has not run is
// passed as null and stays null here, so the page can show an honest
// "unavailable" marker instead of a made-up zero.
//
// Definitions follow the modules the customer already sees below:
// - Next visit: the earliest published visit the service-schedule
//   module returned (it already limits itself to published visits
//   for the next 30 days for this exact location).
// - Open requests: requests the history module shows with a stored
//   status other than "resolved" (its own statuses are received /
//   in_progress / resolved).
// - New replies: requests carrying the stored has_unseen_reply flag
//   the history module itself renders as "New reply from management".
// - Open work orders: published work orders in "open" or
//   "in_progress" — the statuses the work-order module lists as not
//   yet completed or cancelled.
// - Documents: how many private PDFs that module lists for this
//   account and location. Titles and files stay in that module.
// - Latest quality report: the most recent published report by its
//   stored inspection_date, with its stored score when one exists.
// No invoice, balance, price, or payment figure is computed here:
// the authenticated portal does not publish invoices to customers,
// and this summary must never imply that it does.

function asArrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

function visitSortKey(visit) {
  const date = String(visit?.date || "");
  const start = String(visit?.start || "").slice(0, 5);
  return date + "T" + start;
}

export function summarizeCustomerPortal(input) {
  const source = input && typeof input === "object" ? input : {};
  const visits = asArrayOrNull(source.visits);
  const requests = asArrayOrNull(source.requests);
  const workOrders = asArrayOrNull(source.workOrders);
  const documents = asArrayOrNull(source.documents);
  const reports = asArrayOrNull(source.reports);

  let nextVisit = null;
  if (visits && visits.length > 0) {
    const sorted = [...visits].sort((a, b) =>
      visitSortKey(a) < visitSortKey(b) ? -1 : visitSortKey(a) > visitSortKey(b) ? 1 : 0
    );
    const first = sorted[0];
    nextVisit = {
      date: String(first?.date || ""),
      start: String(first?.start || "").slice(0, 5),
      end: String(first?.end || "").slice(0, 5),
    };
  }

  let latestReport = null;
  if (reports && reports.length > 0) {
    const sorted = [...reports].sort((a, b) =>
      String(a?.inspection_date || "") < String(b?.inspection_date || "")
        ? 1
        : String(a?.inspection_date || "") > String(b?.inspection_date || "")
          ? -1
          : 0
    );
    const first = sorted[0];
    latestReport = {
      date: String(first?.inspection_date || ""),
      score: Number.isFinite(first?.score) ? first.score : null,
    };
  }

  return {
    // null = that section's read did not succeed; the page shows a
    // dash for it, never zero. An empty-but-successful read is a
    // real empty state ("none published"), distinct from null.
    nextVisit,
    visitsKnown: visits !== null,
    openRequests:
      requests === null
        ? null
        : requests.filter((r) => r && r.status !== "resolved").length,
    newReplies:
      requests === null
        ? null
        : requests.filter((r) => r && r.has_unseen_reply === true).length,
    openWorkOrders:
      workOrders === null
        ? null
        : workOrders.filter(
            (o) => o && (o.status === "open" || o.status === "in_progress")
          ).length,
    documentCount: documents === null ? null : documents.length,
    latestReport,
    reportsKnown: reports !== null,
  };
}
