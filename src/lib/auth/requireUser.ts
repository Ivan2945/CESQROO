import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

type ProfileRow = {
  user_id: string;
  club_id: string | null;
  role: "admin" | "club_admin" | "club_staff" | string;
  name: string | null;
};

export async function requireUser() {
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
    .single();

  if (profileErr || !profile) redirect("/login");

  const clubId = (profile as ProfileRow).club_id ?? null;

  return { supabase, user, profile: profile as ProfileRow, clubId };
}
