// Customer Service inbox is a company-scoped manager view. These helpers
// summarize only the Supabase RLS-filtered messages supplied by the page.
// No cross-tenant data, global counts, or hidden backend calls.
export const CUSTOMER_INBOX_FILTERS = Object.freeze([
 {id:"attention",en:"Needs attention",es:"Necesita atención"},
 {id:"unread",en:"Unread",es:"Sin leer"},
 {id:"open",en:"Open",es:"Abiertas"},
 {id:"document_copy",en:"Contract copies",es:"Copias de contratos"},
 {id:"resolved",en:"Resolved",es:"Resueltas"},
 {id:"all",en:"All recent",es:"Todas las recientes"}
]);

export function needsCustomerAttention(m) {
 if(!m || m.customer_status==="resolved")return false;
 return !m.read_at || !String(m.customer_response||"").trim();
}
export function summarizeCustomerInbox(messages) {
 const items=Array.isArray(messages)?messages:[];
 return {
  recent:items.length,
  attention:items.filter(needsCustomerAttention).length,
  unread:items.filter(m=>!m.read_at).length,
  open:items.filter(m=>m.customer_status!=="resolved").length,
  document_copy:items.filter(m=>m.category==="document_copy"&&m.customer_status!=="resolved").length,
  resolved:items.filter(m=>m.customer_status==="resolved").length
 };
}
export function filterCustomerInbox(messages,filter) {
 const items=Array.isArray(messages)?messages:[];
 switch(filter) {
  case "attention":return items.filter(needsCustomerAttention);
  case "unread":return items.filter(m=>!m.read_at);
  case "open":return items.filter(m=>m.customer_status!=="resolved");
  case "document_copy":return items.filter(m=>m.category==="document_copy"&&m.customer_status!=="resolved");
  case "resolved":return items.filter(m=>m.customer_status==="resolved");
  case "all":return items;
  default:return [];
 }
}
