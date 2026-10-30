"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Wrong-company rescue (2026-10-29): an employee signed in, landed in
// the wrong company, and every screen honestly showed him an empty
// schedule — nothing anywhere said he was in the wrong company or that
// his shift lived in the other one. This notice renders under an empty
// "my shifts" state when the signed-in member ALSO belongs to other
// companies, and says so in plain words, naming them.
//
// Display-only and fully tolerant: it adds one read of the member's own
// company memberships (the same read the company picker already makes).
// Any problem — no other companies, a failed lookup, missing names —
// renders nothing at all, exactly as if this notice did not exist. It
// never blocks or delays the page around it.
export default function OtherCompaniesNotice({ company, member }) {
  const [others, setOthers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!company?.id || !member?.user_id) return;
        const { data, error } = await supabase()
          .from("company_members")
          .select("company_id, companies(name)")
          .eq("user_id", member.user_id)
          .neq("company_id", company.id);
        if (cancelled || error) return;
        // One name per other company, even if duplicate member rows
        // ever point at the same company twice.
        const byCompany = new Map();
        for (const row of data || []) {
          const name = row.companies?.name;
          if (name && !byCompany.has(row.company_id)) {
            byCompany.set(row.company_id, name);
          }
        }
        if (!cancelled) setOthers([...byCompany.values()]);
      } catch {
        // Silent by design — the empty state above already rendered.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id, member?.user_id]);

  if (others.length === 0 || !company?.name) return null;

  const list =
    others.length === 1
      ? others[0]
      : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;

  return (
    <p style={{ color: "var(--muted)", margin: "10px 0 0" }}>
      Nothing scheduled for you in {company.name}. You also belong to {list} —
      if your shift should be here, tap <strong>← Companies</strong> at the
      top of the screen and switch.
    </p>
  );
}
