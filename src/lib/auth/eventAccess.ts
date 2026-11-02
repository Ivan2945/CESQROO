import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function isShowAdminFor(userId: string | null | undefined, eventId: string): Promise<boolean> {
  if (!userId || !eventId) return false;
  const { data } = await supabaseAdmin
    .from("event_admins")
    .select("event_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  return !!data;
}

export async function showAdminEventIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const { data } = await supabaseAdmin.from("event_admins").select("event_id").eq("user_id", userId);
  return (data ?? []).map((r) => r.event_id as string);
}

export async function eventManagerAccess(eventId: string): Promise<{ allowed: boolean; isAdmin: boolean }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !eventId) return { allowed: false, isAdmin: false };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) return { allowed: true, isAdmin: true };
  return { allowed: await isShowAdminFor(user.id, eventId), isAdmin: false };
}

export async function canManageEvent(eventId: string): Promise<boolean> {
  return (await eventManagerAccess(eventId)).allowed;
}

export async function canManageEventSlug(slug: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("events").select("id").eq("slug", slug).maybeSingle();
  return data ? canManageEvent(data.id as string) : false;
}

export async function requireEventManager(eventId: string): Promise<{ isAdmin: boolean; backHref: string }> {
  const { allowed, isAdmin } = await eventManagerAccess(eventId);
  if (!allowed) redirect("/admin/events");
  return { isAdmin, backHref: isAdmin ? `/admin/events/${eventId}` : `/admin/admon-eventos/${eventId}` };
}
