// WorkTeams accounting categories that can be mapped to a connected
// provider's chart of accounts (migration 068). Shared by the client UI
// and the server routes; contains no secrets and no provider credentials.
//
// Mapping is per company, to that company's OWN QuickBooks accounts.
// A transaction whose needed category is unmapped is NEVER posted -- it
// waits in the sync queue until the company maps it (handoff section
// 15.6). Nothing is ever posted to a generic "miscellaneous" account.
//
// refType "account": the mapping points at a QuickBooks account.
// refType "tax_code": the mapping points at a QuickBooks tax code (sales
// tax on an invoice posts through a tax code in QuickBooks, not an
// account).

export const APP_CATEGORIES = [
  {
    key: "invoice_income",
    label: "Customer invoice income",
    refType: "account",
    help: "The QuickBooks income account your WorkTeams customer invoices post to. Required before any invoice can be sent.",
  },
  {
    key: "invoice_tax",
    label: "Sales tax on invoices",
    refType: "tax_code",
    help: "The QuickBooks tax code applied to invoice sales tax. Required before an invoice that has tax can be sent.",
  },
  {
    key: "other_income",
    label: "Other revenue (Profitability entries)",
    refType: "account",
    help: "The QuickBooks income account for revenue you record by hand on the Profitability page. Mappable now; revenue-entry sync uses it when it is switched on.",
  },
  {
    key: "expense_default",
    label: "Expenses (Profitability entries)",
    refType: "account",
    help: "The QuickBooks expense account for expenses you record by hand on the Profitability page. Mappable now; expense sync uses it when it is switched on.",
  },
];

export function categoryByKey(key) {
  return APP_CATEGORIES.find((c) => c.key === key) || null;
}
