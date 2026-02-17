import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRow = {
  user_id: string;
  club_id: string | null;
  role: "club_admin" | "coach" | "groom" | "member" | string;
};

export async function getCurrentProfileOrAdmin(sb: SupabaseClient) {
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) throw new Error("Not authenticated");

  // expects you already have public.is_admin() SQL function
  const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
  if (adminErr) throw new Error(adminErr.message);

  if (isAdmin) {
    return { isAdmin: true as const, profile: null as ProfileRow | null, user };
  }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("user_id, club_id, role")
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(error.message);

  return { isAdmin: false as const, profile: profile as ProfileRow, user };
}
