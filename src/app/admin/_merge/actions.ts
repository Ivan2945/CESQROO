"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/actions";

// Catalog admin for the show tables (show_riders / show_horses / show_clubs).
// Each type is handled by its OWN action — riders, horses and clubs never mix.
//
// IMPORTANT: event_entries snapshot the rider/horse name at sign-up time
// (event_entries.rider_name / horse_name) and clubs snapshot on submissions
// (event_submissions.club_name). So merging/editing must update BOTH the
// catalog record AND those snapshots, or the old text keeps showing in rosters,
// results and exports.

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

function cleanIds(keepId: string, removeIds: string[]) {
  return [...new Set(removeIds)].filter((id) => id && id !== keepId);
}

async function countEntries(col: "rider_id" | "horse_id" | "club_id", id: string) {
  const { count } = await supabaseAdmin.from("event_entries").select("*", { count: "exact", head: true }).eq(col, id);
  return count ?? 0;
}

// ---- Merge (master = keepId; everything in removeIds folds in then deletes) --

export async function mergeShowRiders(keepId: string, removeIds: string[]): Promise<ActionResult<{ moved: number; removed: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  const remove = cleanIds(keepId, removeIds);
  if (!keepId || remove.length === 0) return { ok: false, message: "Elija un registro maestro y al menos un duplicado." };

  const { data: keep } = await supabaseAdmin.from("show_riders").select("first_name, last_name, full_name").eq("id", keepId).single();
  if (!keep) return { ok: false, message: "No se encontró el registro maestro." };
  const keepName = keep.full_name || `${keep.first_name ?? ""} ${keep.last_name ?? ""}`.trim();

  let moved = 0;
  for (const rid of remove) {
    moved += await countEntries("rider_id", rid);
    const { error: upErr } = await supabaseAdmin.from("event_entries").update({ rider_id: keepId, rider_name: keepName }).eq("rider_id", rid);
    if (upErr) return { ok: false, message: upErr.message };
    const { error: delErr } = await supabaseAdmin.from("show_riders").delete().eq("id", rid);
    if (delErr) return { ok: false, message: delErr.message };
  }
  // Normalize the master's own existing entries to the canonical name.
  await supabaseAdmin.from("event_entries").update({ rider_name: keepName }).eq("rider_id", keepId);

  revalidatePath("/admin/show-riders");
  return { ok: true, data: { moved, removed: remove.length }, message: "ok" };
}

export async function mergeShowHorses(keepId: string, removeIds: string[]): Promise<ActionResult<{ moved: number; removed: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  const remove = cleanIds(keepId, removeIds);
  if (!keepId || remove.length === 0) return { ok: false, message: "Elija un registro maestro y al menos un duplicado." };

  const { data: keep } = await supabaseAdmin.from("show_horses").select("name").eq("id", keepId).single();
  if (!keep) return { ok: false, message: "No se encontró el registro maestro." };
  const keepName = keep.name || "";

  let moved = 0;
  for (const rid of remove) {
    moved += await countEntries("horse_id", rid);
    const { error: upErr } = await supabaseAdmin.from("event_entries").update({ horse_id: keepId, horse_name: keepName }).eq("horse_id", rid);
    if (upErr) return { ok: false, message: upErr.message };
    const { error: delErr } = await supabaseAdmin.from("show_horses").delete().eq("id", rid);
    if (delErr) return { ok: false, message: delErr.message };
  }
  await supabaseAdmin.from("event_entries").update({ horse_name: keepName }).eq("horse_id", keepId);

  revalidatePath("/admin/show-horses");
  return { ok: true, data: { moved, removed: remove.length }, message: "ok" };
}

export async function mergeShowClubs(keepId: string, removeIds: string[]): Promise<ActionResult<{ moved: number; subs: number; removed: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar." };
  const remove = cleanIds(keepId, removeIds);
  if (!keepId || remove.length === 0) return { ok: false, message: "Elija un registro maestro y al menos un duplicado." };

  const { data: keep } = await supabaseAdmin.from("show_clubs").select("name").eq("id", keepId).single();
  if (!keep) return { ok: false, message: "No se encontró el registro maestro." };
  const keepName = keep.name || "";

  let moved = 0;
  let subs = 0;
  for (const rid of remove) {
    moved += await countEntries("club_id", rid);
    const { count: subCount } = await supabaseAdmin.from("event_submissions").select("*", { count: "exact", head: true }).eq("club_id", rid);
    subs += subCount ?? 0;
    const { error: e1 } = await supabaseAdmin.from("event_entries").update({ club_id: keepId }).eq("club_id", rid);
    if (e1) return { ok: false, message: e1.message };
    const { error: e2 } = await supabaseAdmin.from("event_submissions").update({ club_id: keepId, club_name: keepName }).eq("club_id", rid);
    if (e2) return { ok: false, message: e2.message };
    const { error: e3 } = await supabaseAdmin.from("show_clubs").delete().eq("id", rid);
    if (e3) return { ok: false, message: e3.message };
  }
  await supabaseAdmin.from("event_submissions").update({ club_name: keepName }).eq("club_id", keepId);

  revalidatePath("/admin/show-clubs");
  return { ok: true, data: { moved, subs, removed: remove.length }, message: "ok" };
}

// ---- Edit (fix a typo'd record; propagate to entry/submission snapshots) -----

export async function editShowRider(id: string, v: { first?: string; last?: string; name?: string }): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede editar." };
  const first = (v.first ?? "").trim();
  const last = (v.last ?? "").trim();
  if (!first && !last) return { ok: false, message: "El nombre no puede quedar vacío." };
  const full = `${first} ${last}`.trim();
  const { error } = await supabaseAdmin.from("show_riders").update({ first_name: first, last_name: last, full_name: full }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await supabaseAdmin.from("event_entries").update({ rider_name: full }).eq("rider_id", id);
  revalidatePath("/admin/show-riders");
  return { ok: true, data: undefined, message: "ok" };
}

export async function editShowHorse(id: string, v: { first?: string; last?: string; name?: string }): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede editar." };
  const name = (v.name ?? "").trim();
  if (!name) return { ok: false, message: "El nombre no puede quedar vacío." };
  const { error } = await supabaseAdmin.from("show_horses").update({ name }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await supabaseAdmin.from("event_entries").update({ horse_name: name }).eq("horse_id", id);
  revalidatePath("/admin/show-horses");
  return { ok: true, data: undefined, message: "ok" };
}

export async function editShowClub(id: string, v: { first?: string; last?: string; name?: string }): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede editar." };
  const name = (v.name ?? "").trim();
  if (!name) return { ok: false, message: "El nombre no puede quedar vacío." };
  const { error } = await supabaseAdmin.from("show_clubs").update({ name }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await supabaseAdmin.from("event_submissions").update({ club_name: name }).eq("club_id", id);
  revalidatePath("/admin/show-clubs");
  return { ok: true, data: undefined, message: "ok" };
}
