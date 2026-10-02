// Central role model for WorkTeams.
//
// Rank: owner (3) > admin (2) > supervisor (1) > employee (0).
// The app shows "Manager" in the UI for the `admin` database value — every
// company has managers, and `admin` was only ever the manager equivalent.
// All existing RLS policies keyed on ('owner','admin') keep working unchanged.
//
// Supervisor: team visibility without financial or destructive power.
//   CAN: view team schedule, see everyone's in/out times + who's clocked in,
//        view team directory, view/create inspections, view locations,
//        crew messaging, view work orders.
//   CANNOT: payroll reports, profitability, contracts, plans/billing,
//           tier prices, team role changes, pay rates, delete anything.

export const ROLE_RANK = { employee: 0, supervisor: 1, admin: 2, manager: 2, owner: 3 };

// Friendly labels shown in the UI.
export const ROLE_LABEL = {
  employee: "Employee",
  supervisor: "Supervisor",
  admin: "Manager",
  owner: "Owner",
};

// Maps the UI's role picker value to the stored database value.
export const UI_TO_DB_ROLE = {
  employee: "employee",
  supervisor: "supervisor",
  manager: "admin",
  owner: "owner",
};

export function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

export function roleLabel(role) {
  return ROLE_LABEL[role] || role || "Employee";
}

// Full management power: owners and managers.
export function isManagerRole(role) {
  return roleRank(role) >= 2;
}

// Supervisor and up: team visibility.
export function isSupervisorRole(role) {
  return roleRank(role) >= 1;
}
