"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getUser } from "../../../../lib/session";
import { PRODUCT_OWNER_EMAIL } from "../../../../lib/product";
import TierPricesEditor from "../../../../components/TierPricesEditor";

// In-app "Tier Prices" tab. Product owner only — everyone else is sent back
// to the dashboard. Prices are global (same for every company).
export default function TierPricesPage() {
  const params = useParams();
  const companyId = params.companyId;
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      setAllowed(!!u && u.email === PRODUCT_OWNER_EMAIL);
    })();
  }, []);

  if (allowed === null) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <main className="site-shell">
        <h2>Tier Prices</h2>
        <p style={{ color: "var(--muted)" }}>
          Only the product owner can change tier prices.
        </p>
        <Link href={`/app/${companyId}`} className="back-link">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <p className="eyebrow">OWNER</p>
      <h2>Tier prices</h2>
      <p style={{ color: "var(--muted)" }}>
        These are the monthly prices every company sees on the Plans page.
        Changes go live immediately.
      </p>
      <TierPricesEditor />
    </main>
  );
}
