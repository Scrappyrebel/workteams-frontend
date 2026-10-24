import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const login=read("app/customer-login/page.js");
const forgot=read("app/forgot-password/page.js");
const reset=read("app/reset-password/page.js");
const staffLogin=read("app/login/page.js");
const staffSignup=read("app/signup/page.js");
for(const phrase of [
 'new URL("/customer-login",window.location.origin)',
 'confirmUrl.searchParams.set("verified","1")',
 'confirmUrl.searchParams.set("lang",language)',
 'options:{emailRedirectTo:confirmUrl.toString()}',
 'params.get("verified")==="1"',
 'params.get("reset")==="1"',
 '/forgot-password?source=customer&lang=',
 '/customer-portal'
])assert.ok(login.includes(phrase),"Missing customer confirmation/recovery link: "+phrase);
for(const phrase of [
 'params.get("source") === "customer"',
 'params.get("lang") === "es"',
 '/reset-password?source=customer&lang=',
 'isCustomer ?',
 '"/reset-password"',
 'backHref'
])assert.ok(forgot.includes(phrase),"Missing context-preserving reset request: "+phrase);
for(const phrase of [
 'params.get("source") === "customer"',
 'params.get("lang") === "es"',
 '/customer-login?lang=',
 '/forgot-password?source=customer&lang=',
 'router.replace(isCustomer ?',
 'minLength={isCustomer ? 8 : 6}',
 '"Las contraseñas no coinciden."'
])assert.ok(reset.includes(phrase),"Missing customer reset destination or employee preservation: "+phrase);
assert.ok(reset.includes(': "/login"'),"Employees must return to existing staff login");
assert.ok(forgot.includes(': "/reset-password"'),"Employees must keep existing reset redirect");
assert.ok(staffLogin.includes('router.replace("/app")'),"Staff sign-in must remain unchanged");
assert.ok(staffSignup.includes('router.replace("/app")'),"Staff sign-up must remain unchanged");
assert.ok(!login.includes("service_role"),"Browser customer auth must not contain privileged credentials");
console.log("WorkTeams customer email confirmation and English/Spanish password recovery round-trip regression passed; staff routes unchanged.");
