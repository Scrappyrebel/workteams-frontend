# WorkTeams Client Portal — service request histories & replies

The existing location bearer link now displays only customer-service ticket category/date/status and an explicitly customer-safe owner/admin reply. It **never** returns the original message text, subject, sender name, phone, email, location metadata or internal priority to shared link holders. A link is revocable/expiring and queries only portal_messages rows created using that exact token record and current company/location. Up to 30 recent tickets.

Manager workboard shows full original messages as before, plus received/in progress/resolved statuses and optional replies (10–1200 characters). The manager must explicitly confirm a reply is safe for every holder of the location link; update is guarded against double writes and checked by readback. Changes are recorded by an append-only audit trigger on an RLS table with no direct customer/anonymous grant.

Public token lookup calls a separate whitelisted security-definer RPC, with existing rate-limit. If request-history retrieval fails, it shows an unavailable warning rather than inventing an empty history. Successful contact writes refresh the request list.

**Release gate:** apply migration 051 to verified WorkTeams project `hkmkerzjzuxwyotgkoua` before merging; verify invalid/expired token denied, anon cannot read/update source table directly, role restrictions on manager UPDATE, 0 historical auto-publications, protected preview then production READY. Real manager-response and customer-phone testing require real messages and an authorized location link.
