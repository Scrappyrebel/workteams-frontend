import { supabase } from "./supabase";
import { clearLastPath } from "./last-path";

export async function getUser() {
  const { data } = await supabase().auth.getUser();
  return data?.user || null;
}

export async function getSession() {
  const { data } = await supabase().auth.getSession();
  return data?.session || null;
}

export async function signOut() {
  clearLastPath();
  await supabase().auth.signOut();
}

// After a user signs in for the first time, attach their auth account to any
// team membership rows that were added by email invite before they had an account.
// Uses the claim_invite() security-definer function so it works regardless of RLS.
export async function linkMemberOnSignIn(sb, user) {
  if (!user || !user.email) return 0;
  const { data, error } = await sb.rpc("claim_invite");
  if (error) {
    // Fall back to the direct update (covered by the "members link own invite" policy).
    await sb
      .from("company_members")
      .update({ user_id: user.id })
      .is("user_id", null)
      .eq("email", user.email.toLowerCase());
    return 0;
  }
  return data || 0;
}
