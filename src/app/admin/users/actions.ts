"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import type { ActionResult } from "@/lib/types/actions";


export type UserRole = "admin" | "club_admin" | "user";

export type CreatedUser = {
  user_id: string; // Auth user UUID
  email: string;
  name: string;
  role: UserRole;
  club_id: string | null;
  invited: boolean;
};

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function getBool(fd: FormData, key: string) {
  return fd.get(key) === "on";
}

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only).");

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createUserAction(
  _prev: ActionResult<CreatedUser>,
  formData: FormData
): Promise<ActionResult<CreatedUser>> {
  // Only allow global admin
  const { profile } = await requireClubAdmin();
  if (profile.role !== "admin") return { ok: false, message: "Access denied." };

  const email = getText(formData, "email").toLowerCase();
  const name = getText(formData, "name");
  const role = getText(formData, "role") as UserRole;
  const club_id_raw = getText(formData, "club_id");
  const club_id = club_id_raw ? club_id_raw : null;

  const password = getText(formData, "password"); // optional
  const send_invite = getBool(formData, "send_invite"); // optional

  if (!email) return { ok: false, message: "Email is required." };
  if (!name) return { ok: false, message: "Name is required." };
  if (!role || !["admin", "club_admin", "user"].includes(role)) {
    return { ok: false, message: "Role must be admin, club_admin, or user." };
  }
  if ((role === "club_admin" || role === "user") && !club_id) {
    return { ok: false, message: "club_id is required for club_admin/user." };
  }

  const adminClient = adminSupabase();

  // 1) Create Auth user
  let user_id: string;
  let invited = false;

  if (send_invite && !password) {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) return { ok: false, message: error.message };
    if (!data?.user?.id) return { ok: false, message: "Invite failed (no user id returned)." };
    user_id = data.user.id;
    invited = true;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: password || undefined,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) return { ok: false, message: error.message };
    if (!data?.user?.id) return { ok: false, message: "Create user failed (no user id returned)." };
    user_id = data.user.id;
    invited = false;
  }

  // 2) Upsert into public.profiles ONLY
  // Assumes profiles has: user_id, club_id, name, role, created_at
  const { error: profErr } = await adminClient
    .from("profiles")
    .upsert(
      {
        user_id,
        club_id,
        name,
        role,
      },
      { onConflict: "user_id" }
    );

  if (profErr) {
    return { ok: false, message: `Auth user created, but profiles upsert failed: ${profErr.message}` };
  }

  revalidatePath("/admin/users");

  return {
    ok: true,
    message: invited ? "User invited." : "User created.",
    data: { user_id, email, name, role, club_id, invited },
  };
}
