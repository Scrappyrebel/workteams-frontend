import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/050_trigger_helper_execute_restrictions.sql", import.meta.url), "utf8");
const guards = [
  "companies_billing_guard",
  "company_members_guard",
  "same_company_guard",
  "training_approval_company_guard",
  "training_enrollment_guard",
  "training_step_progress_guard"
];
test("limits the grant change to six known trigger guards", () => {
  assert.match(sql, /p\.prorettype = 'pg_catalog\.trigger'::regtype/);
  assert.match(sql, /p\.prosecdef = true/);
  assert.match(sql, /IF number_found <> 6/);
  assert.equal((sql.match(/REVOKE EXECUTE ON FUNCTION public\./g) || []).length, guards.length);
  for(const guard of guards){
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${guard}() FROM PUBLIC, anon, authenticated;`), guard);
  }
});
test("preserves service role, installed triggers and function bodies", () => {
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|ALTER TABLE|CREATE OR REPLACE FUNCTION|GRANT EXECUTE)\b/i);
  assert.match(sql, /has_function_privilege\('service_role', p\.oid, 'EXECUTE'\)/);
  assert.match(sql, /IF match_count <> 0/);
});
