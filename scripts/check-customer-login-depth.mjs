// Guard for the customer-login depth pass (D-WT-04).
// Adds a bilingual "How customer access works" step panel and a
// create-mode password hint — display-only additions at the end
// of the existing card. Everything else about this auth surface
// is pinned byte-for-byte: the 8-character customer minimum
// (form + submit check), the sign-up confirmation redirect back
// to this page, the separate-from-employee-access statement,
// and the customer forgot-password route. The employee minimum
// (6) is a different surface's rule — aligning the two is an
// auth decision for Wendy, NOT something this pass changes.
// NO migration.
import { readFileSync } from "node:fs";

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failures += 1;
  }
}
const page = readFileSync("app/customer-login/page.js", "utf8");

// ---------- new depth ----------
check(page.includes("How customer access works"), "the step panel renders in English");
check(page.includes("Cómo funciona el acceso de clientes"), "the step panel renders in Spanish");
check(
  page.includes("Until then, signing in shows no company information"),
  "the panel explains the pre-approval state honestly"
);
check(
  page.includes("Choose a password of at least 8 characters."),
  "the create-mode password hint renders"
);
check(
  page.indexOf("How customer access works") >
    page.indexOf("Use your existing location link instead"),
  "the panel is appended after the existing links, nothing moved"
);

// ---------- preserved auth discipline ----------
check(page.includes("minLength={8}"), "the form keeps the 8-character customer minimum");
check(
  page.includes("password.length<8"),
  "the submit check keeps the 8-character customer minimum"
);
check(
  page.includes('new URL("/customer-login",window.location.origin)'),
  "sign-up still confirms back to this page"
);
check(
  page.includes("emailRedirectTo:confirmUrl.toString()"),
  "the confirmation redirect is still wired"
);
check(
  page.includes("This is separate from WorkTeams employee access"),
  "the separate-access statement survives verbatim"
);
check(
  page.includes("forgot-password?source=customer"),
  "the customer forgot-password route survives"
);
check(
  page.includes("An account alone grants no company access"),
  "the approval requirement statement survives verbatim"
);
check(
  page.includes('client.auth.signInWithPassword({email:clean,password})'),
  "the sign-in call is unchanged"
);
check(
  page.includes('client.auth.signUp({'),
  "the sign-up call is unchanged"
);

if (failures > 0) {
  console.error("check-customer-login-depth: " + failures + " failure(s)");
  process.exit(1);
}
console.log("check-customer-login-depth: OK");
