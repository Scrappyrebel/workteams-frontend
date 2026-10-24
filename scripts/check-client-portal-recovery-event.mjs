import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const reset=read("app/reset-password/page.js");
const customer=read("app/customer-login/page.js");
const forgot=read("app/forgot-password/page.js");
const employee=read("app/login/page.js");
for(const s of [
 'event !== "PASSWORD_RECOVERY"',
 'session?.user',
 'recoverySeen = true',
 'setValid(true)',
 'setReady(true)',
 'subscription.unsubscribe()',
 'if (!cancelled && !recoverySeen)',
 'setValid(false)',
 'supabase().auth.updateUser({ password })',
 'if (isCustomer)',
 'supabase().auth.signOut({ scope: "local" })',
 '/customer-login?lang=',
 'router.replace(isCustomer ?',
 'minLength={isCustomer ? 8 : 6}'
])assert.ok(reset.includes(s),"Missing verified recovery safety: "+s);
assert.ok(!reset.includes('if (session) {'),"A generic signed-in session must never make password recovery valid");
assert.ok(reset.indexOf('setValid(true)')<reset.indexOf('if (!cancelled && !recoverySeen)'),
  "Only recovery event may allow the password reset form");
assert.ok(reset.indexOf('auth.updateUser({ password })')<reset.indexOf('auth.signOut({ scope: "local" })'),
  "Customer session must close only after changing the password");
assert.ok(customer.includes('emailRedirectTo:confirmUrl.toString()'),"Keep customer confirmation email return");
assert.ok(forgot.includes('/reset-password?source=customer&lang='),"Keep customer reset email return");
assert.ok(reset.includes(': "/login"'),"Keep employee reset destination");
assert.ok(employee.includes('router.replace("/app")'),"Keep employee sign-in unchanged");
console.log("Recovery-specific Supabase event gate, customer logout and employee compatibility checks passed.");
