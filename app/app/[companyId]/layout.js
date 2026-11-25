"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import AppShell from "../../../components/AppShell";
import IosInstallHint from "../../../components/IosInstallHint";
import { supabase } from "../../../lib/supabase";
import { getUser, getSession, linkMemberOnSignIn } from "../../../lib/session";
import { browserOfflineStorage, loadOfflineContext, saveOfflineContext, shellSnapshot, cachedOfflineUser } from "../../../lib/offline-context.mjs";
import { prepareColdClock } from "../../../lib/cold-clock-identity.mjs";
import { CompanyContext } from "../../../lib/company-context";
import { saveLastPath, clearLastPath } from "../../../lib/last-path";
import { entitledTier } from "../../../lib/tiers";

export default function CompanyLayout({ children }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const companyId = params.companyId;
  const [state, setState] = useState({ company: null, member: null, loading: true, offline: false });
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const offline=typeof navigator!=="undefined" && navigator.onLine===false;
      let user = offline ? cachedOfflineUser(browserOfflineStorage(),process.env.NEXT_PUBLIC_SUPABASE_URL) : await getUser();
      if(offline && user) {
        const shell=shellSnapshot(loadOfflineContext(browserOfflineStorage(),user.id,companyId));
        if(shell){setState({company:shell.company,member:shell.member,loading:false,offline:true});return;}
      }
      if (!user) {
        // Offline (Wendy, 2026-11-21): getUser() validates against the
        // server, so with no signal it answers null even for a person
        // who is properly signed in on this phone. The locally stored
        // session still identifies them; company/member then load
        // from the network if it is actually there, or from the saved
        // snapshot if it is not. Only a phone with NO session at all
        // is sent to sign in. Nothing here grants anything: punches
        // still reach the server only with this session's token, and
        // the server re-checks everything before recording them.
        const session = await getSession().catch(() => null);
        if (session?.user) user = session.user;
      }
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
      // Stripe customer/subscription IDs are never readable from the browser
      // (column-level grants); select only the safe columns explicitly.
      // The `timezone` column is newer than some database API caches/grants.
      // Try it first; if the API won't serve it, fall back to the original
      // column list and America/Chicago rather than locking the user out.
      // (2026-10-09 and 2026-10-12 both locked owners out over this.)
      let company = null;
      {
        // Widest read first: timezone + the end-of-shift proof switches
        // (enable_* from 040, require_* from 039, defaults flipped ON by
        // 052). If the API cannot serve some columns yet, fall back step by
        // step instead of locking the user out. Missing proof values are
        // resolved downstream by lib/proof-policy: absence = feature ON and
        // requirement ON (the spec default), never a crash.
        const widest = await sb.from("companies").select("id,name,tier,timezone,subscription_status,is_complimentary,created_at,industry_key,enable_shift_videos,enable_comm_book,require_walkthrough_video,require_book_photo").eq("id", companyId).single();
        if (widest.data) {
          company = widest.data;
        } else {
          const withTz = await sb.from("companies").select("id,name,tier,timezone,subscription_status,is_complimentary,created_at").eq("id", companyId).single();
          if (withTz.data) {
            company = withTz.data;
          } else {
            const withoutTz = await sb.from("companies").select("id,name,tier,subscription_status,is_complimentary,created_at").eq("id", companyId).single();
            company = withoutTz.data;
            if (company) company.timezone = "America/Chicago";
          }
        }
      }
      const { data: member } = await sb
        .from("company_members")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single();
      if (!company || !member) {
        // Offline fallback: the last server-confirmed company/member
        // for THIS signed-in user and THIS company, saved on this
        // phone. Display + local queueing only (see the session note
        // above); the moment the network answers, the live load below
        // is what runs instead.
        const snap = loadOfflineContext(browserOfflineStorage(), user.id, companyId);
        const shell = shellSnapshot(snap);
        if (shell) {
          setState({ company: shell.company, member: shell.member, loading: false, offline: true });
          return;
        }
        clearLastPath();
        setDenied(true);
        setState({ company: null, member: null, loading: false, offline: false });
        return;
      }
      // Feature gating uses the paid entitlement (tier + live subscription
      // status), not the raw tier label. company.tier keeps the raw value
      // for the Plans/billing screens.
      company.effectiveTier = entitledTier(company);
      // Save the confirmed shell for a future no-signal open.
      saveOfflineContext(browserOfflineStorage(), user.id, companyId, {
        shell: { company, member },
      });
      prepareColdClock(browserOfflineStorage(), user.id, companyId, process.env.NEXT_PUBLIC_SUPABASE_URL);
      setState({ company, member, loading: false, offline: false });
    })();
  }, [companyId, router]);

  useEffect(() => {
    const updatePolicy = event => {
      if (event.detail?.companyId !== companyId) return;
      const policy=event.detail.policy;
      if (!policy) return;
      setState(previous => ({...previous,company:previous.company ? {...previous.company,...policy} : null}));
    };
    window.addEventListener("workteams:policy-changed",updatePolicy);
    return () => window.removeEventListener("workteams:policy-changed",updatePolicy);
  },[companyId]);

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
      <IosInstallHint />
      <AppShell company={state.company} member={state.member}>
        {children}
      </AppShell>
    </CompanyContext.Provider>
  );
}

