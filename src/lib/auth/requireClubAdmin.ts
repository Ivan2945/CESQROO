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

  // club_admin MUST have a club_id; admin can be null
  if (profile.role === "club_admin" && !profile.club_id) redirect("/admin/clubs");

  return {
    user,
    profile,                 // ✅ lowercase variable
    clubId: profile.club_id, // can be null for global admin
    isAdmin: profile.role === "admin",
    supabase,
  };
}

