"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

export type UserListRow = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  club_id: string | null;
  club_name: string | null;
  created_at: string | null;
};

// Full user directory (admin only): every profile joined to its auth email and
// club name. Read-only.
export async function getUsersList(): Promise<UserListRow[]> {
  const { profile } = await requireClubAdmin();
  if (profile.role !== "admin") throw new Error("Access denied.");
  const admin = adminSupabase();

  const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const { data: profiles } = await admin.from("profiles").select("user_id, name, role, club_id, created_at");
  const clubIds = [...new Set((profiles ?? []).map((p) => p.club_id).filter(Boolean))] as string[];
  const { data: clubs } = clubIds.length
    ? await admin.from("clubs").select("id, name").in("id", clubIds)
    : { data: [] as { id: string; name: string }[] };
  const clubName = new Map((clubs ?? []).map((c) => [c.id, c.name]));

  return (profiles ?? [])
    .map((p) => ({
      user_id: p.user_id as string,
      email: emailById.get(p.user_id) ?? "—",
      name: (p.name as string) ?? "",
      role: (p.role as string) ?? "",
      club_id: (p.club_id as string | null) ?? null,
      club_name: p.club_id ? clubName.get(p.club_id) ?? null : null,
      created_at: (p.created_at as string | null) ?? null,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

// ---- Show-admin grants (event_admins) --------------------------------------

export type EventAdminRow = {
  event_id: string;
  user_id: string;
  event_name: string;
  user_name: string;
  user_email: string;
};

export async function getEventAdmins(): Promise<EventAdminRow[]> {
  const { profile } = await requireClubAdmin();
  if (profile.role !== "admin") throw new Error("Access denied.");

  const { data: rows } = await supabaseAdmin
    .from("event_admins").select("event_id, user_id, created_at").order("created_at", { ascending: false });
  if (!rows?.length) return [];

  const eventIds = [...new Set(rows.map((r) => r.event_id))] as string[];
  const userIds = [...new Set(rows.map((r) => r.user_id))] as string[];
  const [{ data: events }, { data: profiles }, authList] = await Promise.all([
    supabaseAdmin.from("events").select("id, name").in("id", eventIds),
    supabaseAdmin.from("profiles").select("user_id, name").in("user_id", userIds),
    adminSupabase().auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const evName = new Map((events ?? []).map((e) => [e.id, e.name]));
  const pName = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));
  const email = new Map((authList.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return rows.map((r) => ({
    event_id: r.event_id as string,
    user_id: r.user_id as string,
    event_name: (evName.get(r.event_id) as string) ?? "—",
    user_name: (pName.get(r.user_id) as string) ?? "",
    user_email: email.get(r.user_id) ?? "",
  }));
}

export async function grantShowAdmin(userId: string, eventId: string): Promise<ActionResult<void>> {
  const { profile } = await requireClubAdmin();
  if (profile.role !== "admin") return { ok: false, message: "Access denied." };
  if (!userId || !eventId) return { ok: false, message: "Elija un usuario y un evento." };
  const { error } = await supabaseAdmin
    .from("event_admins").upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  return { ok: true, data: undefined, message: "Acceso al show otorgado." };
}

export async function revokeShowAdmin(userId: string, eventId: string): Promise<ActionResult<void>> {
  const { profile } = await requireClubAdmin();
  if (profile.role !== "admin") return { ok: false, message: "Access denied." };
  const { error } = await supabaseAdmin
    .from("event_admins").delete().eq("event_id", eventId).eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  return { ok: true, data: undefined, message: "Acceso al show removido." };
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
