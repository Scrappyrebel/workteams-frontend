import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/051_authenticated_only_rpc_permissions.sql", import.meta.url), "utf8");
test("three authenticated-only RPCs deny anonymous execution", () => {
  for(const name of ["claim_invite","start_training_exam","submit_training_exam"]){
    assert.match(sql, new RegExp("REVOKE EXECUTE ON FUNCTION public\\."+name+"\\([^;]* FROM PUBLIC, anon;"));
  }
  assert.equal((sql.match(/REVOKE EXECUTE ON FUNCTION /g)||[]).length,3);
});
test("SQL guards both function identities and signed-in RPC grants",()=>{
  assert.match(sql,/authenticated-only RPC preflight failed/);
  assert.match(sql,/NOT has_function_privilege\('authenticated'/);
  assert.doesNotMatch(sql,/REVOKE EXECUTE ON FUNCTION [^;]*FROM [^;]*authenticated;/i);
});
