# WorkTeams client portal: safe location-link invitation copy

WorkTeams is a **revocable location bearer-link** system, not a full customer login. Owners/admins can choose English/Español and copy a friendly invitation including only the selected location's link and a warning not to forward it. No email/SMS is sent automatically.

The manager UI disables copy actions for known expired links or when portal data failed to load. On each copy click, the app checks the live company-scoped portal token by exact ID: rotated, revoked, expired or changed-location records are refused. Copy is allowed only for authorized owner/admin users with the portal feature. The business decides the authorized recipient and sends it through a trusted channel.

Previous per-location contract link lifecycle, customer-safe published reports, request statuses and management response handling remain unchanged. Protected regression checks are added to the production prebuild.
