# WorkTeams client portal access verification

Verified October 24, 2026, in the linked WorkTeams production database.

**Completed live database checks:** Current authorized location access and request-history reads passed. A temporary expired link was rejected, a temporary link was accepted before deletion and rejected after deletion, and the cross-company location association was rejected by the existing database integrity trigger. Test-only location/link rows were rolled back automatically; current customer records and active links were unchanged.

**API correction:** Temporary-staffing submissions now revalidate the exact active company/location link. The API also checks lookup failures, returns private no-store headers, and confirms that an hours update actually changed a row before claiming success. Protected build regression is in scripts/check-client-portal-temp-revocation.mjs.

**Still unverified:** Real customer/manager phone sessions, cross-company browser HTTP write checks, and signed documents delivered to a consenting customer. Do not count this database test as completion of full device acceptance.
