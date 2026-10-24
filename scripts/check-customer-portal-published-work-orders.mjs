import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/061_client_portal_published_work_order_status.sql");
const detail=read("app/app/[companyId]/work-orders/[id]/page.js");
const manager=read("components/ClientIdentityContactManager.js");
const managerPublish=read("components/WorkOrderCustomerPublication.js");
const customer=read("components/AuthenticatedCustomerWorkOrders.js");
const customerPortal=read("app/customer-portal/page.js");
for(const term of [
 "can_view_work_orders boolean not null default false",
 "create table if not exists public.client_portal_work_order_publications(",
 "enable row level security",
 "revoke all on public.client_portal_work_order_publications",
 "set_workteams_customer_work_order_access(",
 "not public.workteams_client_portal_pilot_manager(p_company_id)",
 "g.location_id=p_location_id and g.revoked_at is null",
 "ct.status='active' and ct.revoked_at is null",
 "can_view_work_orders=p_allow",
 "set_workteams_work_order_publication(",
 "not public.workteams_client_portal_pilot_manager(v_order.company_id)",
 "v_order.location_id is null",
 "order by x.created_at desc,x.id desc limit 1",
 "get_workteams_work_order_publication_for_manager(",
 "get_workteams_authenticated_customer_work_orders(",
 "public.workteams_customer_authorized_location(p_company_id,p_location_id)",
 "g.can_view_work_orders=true",
 "pub.published=true and pub.company_id=w.company_id",
 "pub.location_id=w.location_id",
 "where w.company_id=p_company_id and w.location_id=p_location_id",
 "select w.id,w.status,w.due_date,w.created_at,pub.customer_title",
 "limit 20",
 "'account_linked',exists(",
 "'quality_access',g.can_view_quality",
 "'work_order_access',g.can_view_work_orders",
 "from public,anon,authenticated",
 "to authenticated"
])assert.ok(sql.includes(term),"Missing work-order security guard: "+term);
for(const privateField of ["w.description","w.assigned_to","w.agreed_price","w.completed_at","w.priority","work_order_comments"])
 assert.ok(!sql.includes(privateField),"Private field must not escape: "+privateField);
for(const term of [
 "set_workteams_work_order_publication",
 "get_workteams_work_order_publication_for_manager",
 "customer-safe title",
 "Withdraw customer publication",
 "window.confirm"
])assert.ok(managerPublish.includes(term),"Missing publication manager controls: "+term);
for(const term of [
 "set_workteams_customer_work_order_access",
 "p_contact_id:contact.id",
 "p_location_id:location.id",
 "p_allow:allow",
 "Revoke published work orders",
 "Allow published work orders"
])assert.ok(manager.includes(term),"Missing contact/location work-order permission: "+term);
for(const term of [
 "get_workteams_authenticated_customer_work_orders",
 "setItems([])",
 "visibilitychange",
 "Published Service Work Orders",
 "Órdenes de servicio publicadas",
 "data.work_orders"
])assert.ok(customer.includes(term),"Missing authenticated customer status safeguards: "+term);
assert.ok(detail.includes("WorkOrderCustomerPublication"));
assert.ok(customerPortal.includes("AuthenticatedCustomerWorkOrders"));
console.log("Published-only work orders, manager approval, exact customer/location grant, private-field exclusion and withdrawal regression passed.");
