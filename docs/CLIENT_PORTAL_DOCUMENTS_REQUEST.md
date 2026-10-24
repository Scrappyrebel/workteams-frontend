# WorkTeams Client Portal — scoped contract copy request and fulfillment

**Capability:** A customer holding an active, expiring/revocable link for **one location** can submit and track a request for a copy of that location's existing signed contract. The manager can review the request, verify the recipient independently, deliver the signed copy via a separate trusted channel, and update the customer-facing status. **No private document is ever downloadable or linked through the bearer-token page.**

## Customer workflow
1. Visit the active location link, open Documents & Agreements, and optionally enter a name.
2. Press **Request a contract copy / Solicitar copia del contrato**. This now makes a real server-side POST; it does **not** just fill the general Contact form.
3. Server rechecks exact location token, expiration, company/location association and existence of an approved signed contract. Requests without a valid signed contract are rejected, without inventing documents.
4. New request is inserted in `portal_messages` as `category=document_copy` for that token/company/location. The owner inbox receives it and optional email notification is best effort. Client sees acknowledgment only when the write is confirmed; failure does not claim success.
5. Customer can refresh **My Request Status**, which shows only `document_copy` category, received/in progress/resolved status, created time and a manager-approved safe reply. Original message and sender identity remain restricted. One unresolved document-copy request is allowed per token; after a manager resolves it, a new request is possible.

## Manager workflow
- In the **Client Portal → Customer Service inbox**, copy requests are clearly marked.
- Verify the intended recipient **outside the shared bearer location link**, then deliver using an independently authenticated secure method. Do not paste document URLs or attachments into customer reply.
- Mark the request `resolved` only after checking the delivery confirmation and entering customer-safe reply. A database constraint rejects HTTP(S), www links, and common document filenames in the response to a `document_copy` item. Manager response updates remain tenant-scoped, audited by the existing response audit trigger, and show only safe status fields to the exact still-active token.

## Security and test boundaries
- Migration `supabase/052_client_portal_document_copy_requests.sql` adds one explicit request category, an index for unique active copy requests per token, and a customer-response safety check. It does not migrate customer files, share external provider URLs or touch payroll, alarm codes, invoices or other locations.
- Contact API validates token type/length, active expiry, exact company/location, signed contract, outstanding copy requests and company manager inbox save. Rate limiting and no-cache headers apply. Revoked or rotated tokens cannot refresh history or make new requests.
- Protected `scripts/check-client-portal-documents-request.mjs` validates client API/DB/inbox/readback wiring. CI preview and production must both pass before closing the **WorkTeams document-copy workflow source/release** checklist gate.
- Live manager-to-real-customer fulfillment, delivery and mobile/cross-tenant authorization are **separate acceptance gates**, not proven by compilation or synthetic invalid-token tests.
