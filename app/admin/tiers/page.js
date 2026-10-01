"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../../../lib/session";
import { PRODUCT_OWNER_EMAIL } from "../../../lib/product";
import TierPricesEditor from "../../../components/TierPricesEditor";

// Product-owner-only page for editing tier prices.
// The same editor also lives as the "Tier Prices" tab inside the app.
export default function TierPricesAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (!u || u.email !== PRODUCT_OWNER_EMAIL) {
        router.replace("/login");
        return;
      }
      setAllowed(true);
    })();
  }, [router]);

  if (!allowed) return <p>Loading…</p>;

  return (
    <main className="site-shell" style={{ maxWidth: 480 }}>
      <p className="eyebrow">ADMIN</p>
      <h2>Tier prices</h2>
      <p style={{ color: "var(--muted)" }}>
        These show on the landing page and the Plans page. Changes go live immediately.
      </p>
      <TierPricesEditor />
    </main>
  );
}
