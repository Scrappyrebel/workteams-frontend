"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabase";
import { getUser, linkMemberOnSignIn } from "../../../lib/session";
import { CompanyContext } from "../../../lib/company-context";

export default function CompanyLayout({ children }) {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId;
  const [state, setState] = useState({ company: null, member: null, loading: true });
  const [denied, setDenied] = useState(false);
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const sb = supabase();
      await linkMemberOnSignIn(sb, user);
      const { data: company, error: cErr } = await sb.from("companies").select("*").eq("id", companyId).single();
      const { data: member, error: mErr } = await sb
        .from("company_members")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single();
      if (!company || !member) {
        setDenied(true);
        setDiag({
          companyId: String(companyId),
          userId: user.id,
          userEmail: user.email,
          companyFound: !!company,
          memberFound: !!member,
          companyError: cErr ? `${cErr.code}: ${cErr.message}` : null,
          memberError: mErr ? `${mErr.code}: ${mErr.message}` : null,
        });
        setState({ company: null, member: null, loading: false });
        return;
      }
      setState({ company, member, loading: false });
    })();
  }, [companyId, router]);

  if (denied) {
    return (
      <main className="site-shell">
        <section className="panel" style={{ padding: 30 }}>
          <h2>No access to this company</h2>
          <p style={{ color: "var(--muted)" }}>
            Your account isn't on this company's team yet. Ask an owner or admin to add you by email.
          </p>
          {diag && (
            <details style={{ marginTop: 16, fontSize: "0.8rem", textAlign: "left" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Tap for technical details</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f6f6f6", padding: 12, borderRadius: 8, marginTop: 8 }}>
                {JSON.stringify(diag, null, 2)}
              </pre>
            </details>
          )}
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
