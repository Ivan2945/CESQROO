import { supabaseAdmin } from "@/lib/supabase/admin";

// "Show admins" are users granted read access to a single event's full roster
// (via the event_admins table). This is a VIEW grant only — it never confers
// edit rights; the app keeps edit/commit/config controls global-admin-only.

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
