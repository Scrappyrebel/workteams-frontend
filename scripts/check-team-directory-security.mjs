import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/049_team_directory_security_invoker.sql", import.meta.url),
  "utf8"
);

test("directory view uses the caller's privileges, not its owner's", () => {
  assert.match(migration, /CREATE OR REPLACE VIEW public\.team_directory\s+WITH \(security_invoker = true, security_barrier = true\)/i);
  assert.match(migration, /FROM workteams_security\.allowed_team_directory\(\)/i);
});

test("roster helper is private, authenticated, and explicitly tenant scoped", () => {
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS workteams_security/i);
  assert.match(migration, /REVOKE ALL ON SCHEMA workteams_security FROM PUBLIC, anon/i);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/i);
  assert.match(migration, /WHERE auth\.uid\(\) IS NOT NULL/i);
  assert.match(migration, /me\.company_id = m\.company_id\s+AND me\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION workteams_security\.allowed_team_directory\(\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION workteams_security\.allowed_team_directory\(\) TO authenticated/i);
});

test("roster exposes only limited non-sensitive columns, not employee details", () => {
  assert.match(migration, /RETURNS TABLE \(\s*id uuid,\s*company_id uuid,\s*display_name text,\s*role text\s*\)/i);
  assert.match(migration, /SELECT m\.id, m\.company_id, m\.display_name, m\.role/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.team_directory FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT SELECT ON TABLE public\.team_directory TO authenticated/i);
});
