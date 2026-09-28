import { supabase } from "./supabase";

export async function getUser() {
  const { data } = await supabase().auth.getUser();
  return data?.user || null;
}

export async function getSession() {
  const { data } = await supabase().auth.getSession();
  return data?.session || null;
}

export async function signOut() {
  await supabase().auth.signOut();
}

// After a user signs in for the first time, attach their auth account to any
// team membership rows that were added by email invite before they had an account.
export async function linkMemberOnSignIn(sb, user) {
  if (!user || !user.email) return;
  await sb
    .from("company_members")
    .update({ user_id: user.id })
    .is("user_id", null)
    .eq("email", user.email.toLowerCase());
}
