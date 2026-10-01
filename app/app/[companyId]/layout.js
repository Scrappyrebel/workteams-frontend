"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabase";
import { getUser, linkMemberOnSignIn } from "../../../lib/session";
import { CompanyContext } from "../../../lib/company-context";
import { saveLastPath, clearLastPath } from "../../../lib/last-path";

export default function CompanyLayout({ children }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const companyId = params.companyId;
  const [state, setState] = useState({ company: null, member: null, loading: true });
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      // Guard against non-UUID route params (e.g. /app/locations) — send back to company list.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(companyId))) {
        router.replace("/app");
        return;
      }
      const sb = supabase();
      await linkMemberOnSignIn(sb, user);
      const { data: company } = await sb.from("companies").select("*").eq("id", companyId).single();
      const { data: member } = await sb
        .from("company_members")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single();
      if (!company || !member) {
        clearLastPath();
        setDenied(true);
        setState({ company: null, member: null, loading: false });
        return;
      }
      setState({ company, member, loading: false });
    })();
  }, [companyId, router]);

  // Remember where the user was so the app icon reopens here.
  useEffect(() => {
    saveLastPath(pathname);
  }, [pathname]);

  if (denied) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          <h2>No access to this company</h2>
          <p style={{ color: "var(--muted)" }}>
            Your account isn't on this company's team yet. Ask an owner or admin to add you by email.
          </p>
          <a href="/app" className="back-link">← Back to companies</a>
        </section>
      </main>
    );
  }

  return (
    <CompanyContext.Provider value={state}>
      <AppShell company={state.company} member={state.member}>
        {children}
      </AppShell>
    </CompanyContext.Provider>
  );
}
