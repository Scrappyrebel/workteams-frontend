# WorkTeams customer email confirmation and password-recovery routing

Updated October 24, 2026. This work changes only **how customer users reach their own login after an email-confirmation or reset link**. The employee signup, sign-in and reset routes retain their existing behavior.

## Customer journey

1. The separate `/customer-login?mode=create&lang=en|es` page passes `options.emailRedirectTo` to Supabase Auth. Confirmation returns the user to `/customer-login?verified=1&lang=en|es`, not `/app` or staff login.
2. A customer selects Forgot password to visit `/forgot-password?source=customer&lang=en|es`. The Supabase Auth recovery-email `redirectTo` points to `/reset-password?source=customer&lang=en|es`.
3. On a valid recovery session, after changing the password, customers return to `/customer-login?lang=en|es&reset=1`. Customers have an 8-character client-side minimum; employee reset retains the existing 6-character UI minimum.
4. The current `/customer-portal` authorization guard still checks confirmed Auth email, approved contact, active company feature flag and exact company/location permission on every customer read and write. **A confirmed email alone grants no customer data access**.
5. The original staff `/signup`, `/login`, `/forgot-password` and `/reset-password` paths retain existing `/app`, `/login` or non-customer recovery behavior.

## Supabase Auth redirect allowlist — required release check

On the **WorkTeams Supabase project only** (`hkmkerzjzuxwyotgkoua`), inspect **Authentication → URL Configuration → Redirect URLs**. Supabase requires chosen redirect URLs to be explicitly allowlisted; otherwise it may silently return users to the default Site URL. Prefer explicit production entries rather than a broad wildcard:

- `https://app.lillybsjanitorial.com/customer-login?verified=1&lang=en`
- `https://app.lillybsjanitorial.com/customer-login?verified=1&lang=es`
- `https://app.lillybsjanitorial.com/reset-password?source=customer&lang=en`
- `https://app.lillybsjanitorial.com/reset-password?source=customer&lang=es`

Check both app origins if `app.lillybsjanitorial.com` redirects to another canonical hostname. Confirm email/password authentication remains enabled. Do not change the existing Site URL, employee redirects or Supabase account/project details without a separate review. No secrets or passwords in URL query parameters.

**Verification limit:** source regression and a production HTTP 200 page smoke test cannot prove Supabase's current allowlist, delivery of real email, consumption of a reset token or success on Android and iPhone. With no real approved customer enabled, those must be tested later using a consenting owner-approved test account. Do not label the email round trip or the broad customer-acceptance gate complete until that happens.

Reference: https://supabase.com/docs/guides/auth/redirect-urls
