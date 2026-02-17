"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

type UserType = "admin" | "club_admin";

export async function createUserAction(formData: FormData) {
  const supabase = await supabaseServer();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  const role = String(formData.get("role") ?? "").trim() as UserType;
  const clubId = String(formData.get("club_id") ?? "").trim();

  if (!email) throw new Error("Email is required.");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (role !== "admin" && role !== "club_admin") throw new Error("Invalid role.");
  if (role === "club_admin" && !clubId) throw new Error("Club is required for club admins.");

  // 1) Create Auth user (service role)
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  let userId = created?.user?.id;

  // If user already exists, recover their user_id from profiles by email
  // (Since your profiles table has no email column, we can't do profiles.email lookup.)
  // Instead: try to find user by listing users (small scale OK).
  if (createErr || !userId) {
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw new Error(listErr.message);

    const match = listData.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!match?.id) throw new Error(createErr?.message ?? "Failed to create user and could not find existing user.");

    userId = match.id;
  }

  // 2) Upsert profile (your schema: user_id, club_id, role, name)
  const profileClubId = role === "club_admin" ? clubId : null;

  const { error: profErr } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        club_id: profileClubId,
        role,
        name: name || null,
      },
      { onConflict: "user_id" }
    );

  if (profErr) throw new Error(profErr.message);

  // 3) If club_admin, upsert membership row (club_memberships: club_id, user_id, role)
  if (role === "club_admin") {
    const { error: memErr } = await supabase
      .from("club_memberships")
      .upsert(
        { club_id: clubId, user_id: userId, role: "club_admin" },
        { onConflict: "club_id,user_id" }
      );

    if (memErr) throw new Error(memErr.message);
  }

  return { userId, email, role, clubId: role === "club_admin" ? clubId : null };
}
