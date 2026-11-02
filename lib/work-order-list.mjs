// Work Orders list helpers (Depth D-WT-29) — pure, display-only.
//
// Everything here derives from fields the list page already loads
// (migration 003 work_orders + 026 source/agreed_price): title,
// description, priority, status, due_date, locations(name) and the
// assignee name the page resolves from team_directory. Nothing here
// performs a write or a network call, or changes a stored value: overdue is a comparison
// of the stored due_date against the company's today, search matches
// stored text, and sorting reorders the already-loaded rows in memory
// only. The default sort ("newest") returns the rows in exactly the
// order the page's existing created_at-descending query delivered.

export const WORK_ORDER_PRIORITY_RANK = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const OPEN_STATUSES = ["open", "in_progress"];

// An order is overdue only while it is still actionable (open or in
// progress) and its stored due date is before today. Completed and
// cancelled orders are never overdue, and an order due today is not
// overdue yet. due_date and today are both "YYYY-MM-DD" strings, so a
// plain string comparison is the correct date comparison.
export function isWorkOrderOverdue(order, today) {
  if (!order || !today) return false;
  if (!OPEN_STATUSES.includes(order.status)) return false;
  return Boolean(order.due_date) && String(order.due_date) < today;
}

export function isWorkOrderDueToday(order, today) {
  if (!order || !today) return false;
  if (!OPEN_STATUSES.includes(order.status)) return false;
  return Boolean(order.due_date) && String(order.due_date) === today;
}

// Whole days between the stored due date and today (positive when
// overdue). Date-only strings parse as UTC midnight, so the
// difference is an exact number of days.
export function workOrderDaysOverdue(order, today) {
  if (!isWorkOrderOverdue(order, today)) return 0;
  const due = Date.parse(String(order.due_date));
  const now = Date.parse(today);
  if (Number.isNaN(due) || Number.isNaN(now)) return 0;
  return Math.round((now - due) / 86400000);
}

export function countWorkOrdersByStatus(orders) {
  const counts = { open: 0, in_progress: 0, completed: 0, cancelled: 0, all: 0 };
  for (const o of orders || []) {
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, o.status)) counts[o.status] += 1;
  }
  return counts;
}

export function countOverdueWorkOrders(orders, today) {
  return (orders || []).filter((o) => isWorkOrderOverdue(o, today)).length;
}

// Search over the text the card already shows: title, description,
// location name, assignee name, and the status/priority labels the
// page renders. An empty query returns the rows untouched.
export function searchWorkOrders(orders, query, labels = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...(orders || [])];
  const statusLabels = labels.status || {};
  const priorityLabels = labels.priority || {};
  return (orders || []).filter((o) => {
    const haystack = [
      o.title || "",
      o.description || "",
      (o.locations && o.locations.name) || "",
      o.assignee_name || "",
      statusLabels[o.status] || o.status || "",
      priorityLabels[o.priority] || o.priority || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

// Sort choices for the list. "newest" is the page's existing order
// (the query's created_at descending) and is the default, so the page
// looks exactly as before until a manager picks another order.
// "due_date": soonest due first; orders with no due date go last.
// "priority": Urgent, High, Normal, Low. Ties keep the loaded order
// (the sort is made stable with the original index).
export function sortWorkOrders(orders, sortKey) {
  const rows = [...(orders || [])];
  if (sortKey !== "due_date" && sortKey !== "priority") return rows;
  return rows
    .map((o, i) => ({ o, i }))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "due_date") {
        const da = a.o.due_date ? String(a.o.due_date) : null;
        const db = b.o.due_date ? String(b.o.due_date) : null;
        if (da && db) cmp = da < db ? -1 : da > db ? 1 : 0;
        else if (da) cmp = -1;
        else if (db) cmp = 1;
      } else {
        const ra = WORK_ORDER_PRIORITY_RANK[a.o.priority] ?? 2;
        const rb = WORK_ORDER_PRIORITY_RANK[b.o.priority] ?? 2;
        cmp = ra - rb;
      }
      return cmp !== 0 ? cmp : a.i - b.i;
    })
    .map((x) => x.o);
}
