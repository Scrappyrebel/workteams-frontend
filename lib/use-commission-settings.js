"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useCompany } from "./company-context";
import {
  DEFAULT_COMMISSION_SETTINGS,
  canUseOwnerCalculator,
  canViewCommission,
  isCompanyManagement,
  isCompanyOwner,
  loadCommissionSettings,
} from "./commission";

/**
 * Client hook: resolves the per-company commission settings for the
 * active company from CompanyContext (the layout already resolved the
 * company + member). Tolerates the settings table being absent
 * (pre-migration) — settings fall back to mode "off".
 *
 * Returns { loading, company, member, isOwner, isManagement,
 * settings, visible, ownerCalculator }.
 */
export function useCommissionSettings() {
  const { company, member, loading: companyLoading } = useCompany();
  const [settings, setSettings] = useState({ ...DEFAULT_COMMISSION_SETTINGS });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (companyLoading) return;
    if (!company?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const loaded = await loadCommissionSettings(supabase(), company.id);
      if (cancelled) return;
      setSettings(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id, companyLoading]);

  const isOwner = isCompanyOwner(member);
  const isManagement = isCompanyManagement(member);
  return {
    loading: companyLoading || loading,
    company,
    member,
    isOwner,
    isManagement,
    settings,
    visible: canViewCommission(settings, member),
    ownerCalculator: canUseOwnerCalculator(settings, member),
  };
}
