# WorkTeams Client Portal — location-scoped documents and agreement requests

WorkTeams Client Portal is a **revocable bearer link to one location**. It does not have Business HQ's verified customer user account or the same document-storage permissions.

This release provides a bilingual Documents & Agreements / Documentos y contratos entry in Quick Access. The existing approved location contract summary and amendment statuses remain visible. A **Request a contract copy** button fills the existing Customer Service form with a request for a securely delivered signed document; the customer still sends the request. No new file URLs, public buckets, service credentials, other locations, or unrelated billing data are exposed.

Business HQ's verified-customer private file download cannot safely be copied into a bearer-link portal. Workforce already provides company-scoped, approved external agreement links to signed-in customers. Track full authenticated document service separately before claiming full parity.

Protected test `scripts/check-client-portal-documents-request.mjs` must pass, followed by Vercel preview and production checks. Test real customer contact delivery with a currently authorized location token separately.
