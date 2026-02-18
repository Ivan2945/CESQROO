import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

type ProfileRow = {
  user_id: string;
  club_id: string | null;
  role: "admin" | "club_admin" | "club_staff" | string;
  name: string | null;
};

export async function requireClubAdmin() {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, club_id, role, name")
    .eq("user_id", user.id)
    .single<ProfileRow>();

  if (profileErr || !profile) redirect("/login");

  const isAllowed = profile.role === "admin" || profile.role === "club_admin";
  if (!isAllowed) redirect("/");

  const hasClub =
    typeof profile.club_id === "string" && profile.club_id.trim().length > 0;

  // club_admin MUST have a club_id; admin can be null
  if (profile.role === "club_admin" && !hasClub) redirect("/no-club");

  return {
    user,
    profile,
    clubId: profile.club_id,
    isAdmin: profile.role === "admin",
    supabase,
  };
}
