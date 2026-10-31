import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const pages={
 "login":read("app/login/page.js"),
 "signup":read("app/signup/page.js"),
 "forgot-password":read("app/forgot-password/page.js"),
 "reset-password":read("app/reset-password/page.js"),
};
const mapper=read("lib/auth-errors.js");
for(const [name,src] of Object.entries(pages)){
  assert.ok(src.includes("friendlyAuthErrorMessage"), name+" must use friendlyAuthErrorMessage");
  assert.ok(!src.includes("setError(err.message"), name+" must not pass a raw provider error to setError");
  assert.ok(!src.includes("setError(error.message"), name+" must not pass a raw provider error to setError");
}
assert.ok(pages["forgot-password"].includes("friendlyAuthErrorMessage(err, t)"), "forgot-password must pass its bilingual t()");
assert.ok(pages["reset-password"].includes("friendlyAuthErrorMessage(err, t)"), "reset-password must pass its bilingual t()");
for(const marker of ["invalid_credentials","user_already_exists","same_password","weak_password","email_address_invalid","over_request_rate_limit","failed to fetch","console.error"])
  assert.ok(mapper.includes(marker), "auth-errors mapper missing: "+marker);
// Customer login keeps its existing fixed-message catch.
const customer=read("app/customer-login/page.js");
assert.ok(!customer.includes("err.message") && !customer.includes("error.message"), "customer-login must keep discarding raw provider errors");
console.log("WorkTeams employee auth surfaces route provider errors through the friendly mapper; raw text is console-only.");
