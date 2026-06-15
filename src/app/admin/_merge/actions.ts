"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/actions";

// Each merge is its OWN action for a single catalog type — riders, horses and
// clubs never mix, so there's no way to accidentally merge across types. They
// wrap the SECURITY DEFINER DB functions (merge_show_*), which reassign every
// event_entries reference to the kept record and then delete the duplicate.

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

async function countEntries(col: "rider_id" | "horse_id" | "club_id", id: string) {
  const { count } = await supabaseAdmin
    .from("event_entries")
    .select("*", { count: "exact", head: true })
    .eq(col, id);
  return count ?? 0;
}

export async function mergeShowRiders(keepId: string, removeId: string): Promise<ActionResult<{ moved: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  if (!keepId || !removeId) return { ok: false, message: "Faltan registros." };
  if (keepId === removeId) return { ok: false, message: "Elija dos jinetes distintos." };
  const moved = await countEntries("rider_id", removeId);
  const { error } = await supabaseAdmin.rpc("merge_show_riders", { p_keep: keepId, p_remove: removeId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/show-riders");
  return { ok: true, data: { moved }, message: "ok" };
}

export async function mergeShowHorses(keepId: string, removeId: string): Promise<ActionResult<{ moved: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  if (!keepId || !removeId) return { ok: false, message: "Faltan registros." };
  if (keepId === removeId) return { ok: false, message: "Elija dos caballos distintos." };
  const moved = await countEntries("horse_id", removeId);
  const { error } = await supabaseAdmin.rpc("merge_show_horses", { p_keep: keepId, p_remove: removeId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/show-horses");
  return { ok: true, data: { moved }, message: "ok" };
}

export async function mergeShowClubs(keepId: string, removeId: string): Promise<ActionResult<{ moved: number; subs: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  if (!keepId || !removeId) return { ok: false, message: "Faltan registros." };
  if (keepId === removeId) return { ok: false, message: "Elija dos clubes distintos." };
  const moved = await countEntries("club_id", removeId);
  const { count: subsCount } = await supabaseAdmin
    .from("event_submissions")
    .select("*", { count: "exact", head: true })
    .eq("club_id", removeId);
  const { error } = await supabaseAdmin.rpc("merge_show_clubs", { p_keep: keepId, p_remove: removeId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/show-clubs");
  return { ok: true, data: { moved, subs: subsCount ?? 0 }, message: "ok" };
}
