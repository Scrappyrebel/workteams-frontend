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
// Invite claiming happens ONLY through the claim_invite() security-definer
// function, which sets user_id on the matching pending invite and nothing else.
// There is intentionally no client-side fallback: a direct company_members
// UPDATE from the browser would let a claimant alter role/pay/company fields.
export async function linkMemberOnSignIn(sb, user) {
  if (!user || !user.email) return 0;
  const { data, error } = await sb.rpc("claim_invite");
  if (error) {
    console.error("claim_invite failed", error.message);
    return 0;
  }
  return data || 0;
}
