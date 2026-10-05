"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useCompany } from "./company-context";

// Returns { clockedIn, checking } — whether the current member has an open time entry.
// Owners/admins are always treated as "clocked in" (exempt from the gate).
export function useClockedIn() {
  const { company, member, loading } = useCompany();
  const [clockedIn, setClockedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading || !company || !member) {
      setChecking(loading);
      return;
    }
    // Owners/admins are exempt.
    if (member.role === "owner" || member.role === "admin") {
      setClockedIn(true);
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase()
        .from("time_entries")
        .select("id")
        .eq("company_id", company.id)
        .eq("member_id", member.id)
        .is("clock_out", null)
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setClockedIn(!!data);
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, company, member]);

  return { clockedIn, checking };
}

// Guard helper for write actions. Returns true if allowed, false + alert if not.
export function requireClockedIn(clockedIn, actionName = "do this") {
  if (clockedIn) return true;
  alert(`You're not clocked in. Clock in on the Time Clock tab to ${actionName}.`);
  return false;
}
