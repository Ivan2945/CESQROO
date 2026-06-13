"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/actions";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

// Delete a whole club submission (its entries cascade-delete via FK).
export async function deleteSubmissionAction(
  submissionId: string,
  eventId: string
): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede eliminar inscripciones." };

  const { error } = await supabaseAdmin.from("event_submissions").delete().eq("id", submissionId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  return { ok: true, data: undefined, message: "Inscripción eliminada." };
}

// Delete a single participation (entry).
export async function deleteEntryAction(
  entryId: string,
  eventId: string
): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede eliminar participaciones." };

  const { error } = await supabaseAdmin.from("event_entries").delete().eq("id", entryId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  return { ok: true, data: undefined, message: "Participación eliminada." };
}

// Merge duplicate submissions: when a club submitted multiple forms, fold them
// into one. SAFE — entries are REASSIGNED to the club's earliest submission, not
// deleted; only the now-empty extra submission rows are removed.
export async function mergeDuplicateSubmissionsAction(eventId: string): Promise<ActionResult<{ merged: number }>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede combinar inscripciones." };

  const { data: subs } = await supabaseAdmin
    .from("event_submissions")
    .select("id, club_id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (!subs || subs.length === 0) return { ok: true, data: { merged: 0 }, message: "Sin inscripciones." };

  // Group by club; keep the earliest submission per club as the target.
  const byClub = new Map<string, { id: string }[]>();
  for (const s of subs) {
    if (!s.club_id) continue;
    (byClub.get(s.club_id) ?? byClub.set(s.club_id, []).get(s.club_id)!).push(s);
  }

  let merged = 0;
  for (const group of byClub.values()) {
    if (group.length < 2) continue;
    const target = group[0].id;
    const dupes = group.slice(1).map((g) => g.id);
    // Move every entry from the duplicates onto the target submission.
    const { error: moveErr } = await supabaseAdmin
      .from("event_entries").update({ submission_id: target }).in("submission_id", dupes);
    if (moveErr) return { ok: false, message: "No se pudieron mover las participaciones: " + moveErr.message };
    // Remove the now-empty duplicate submission rows (entries already moved).
    const { error: delErr } = await supabaseAdmin.from("event_submissions").delete().in("id", dupes);
    if (delErr) return { ok: false, message: "No se pudieron eliminar duplicados: " + delErr.message };
    merged += dupes.length;
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, data: { merged }, message: merged === 0 ? "No había duplicados." : `Se combinaron ${merged} inscripción(es) duplicada(s).` };
}

// Manually edit a participation (admin fix-ups: wrong name, mistyped horse,
// wrong class/section/days). Updates the entry, and — so the correction shows up
// everywhere — also renames the linked show rider/horse record when its name
// changed. Pass renameRecord=false to change only this entry's snapshot.
export type EditEntryInput = {
  entryId: string;
  eventId: string;
  riderName: string;
  horseName: string;
  height: string;
  section: string;
  days: string[];
  circuit: boolean;
  discount: boolean;
  renameRecord: boolean;
};

export async function updateEntryAction(input: EditEntryInput): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede editar participaciones." };

  const rider = input.riderName.trim();
  const horse = input.horseName.trim();
  if (!rider || !horse) return { ok: false, message: "Jinete y caballo no pueden estar vacíos." };
  if (!input.height || !input.section) return { ok: false, message: "Elija altura y sección." };
  if (!Array.isArray(input.days) || input.days.length === 0) return { ok: false, message: "Elija al menos un día." };

  const { data: entry } = await supabaseAdmin
    .from("event_entries")
    .select("id, rider_id, horse_id")
    .eq("id", input.entryId)
    .single();
  if (!entry) return { ok: false, message: "Participación no encontrada." };

  const { error } = await supabaseAdmin
    .from("event_entries")
    .update({
      rider_name: rider,
      horse_name: horse,
      height: input.height,
      section: input.section,
      days: input.days,
      circuit: input.circuit,
      discount: input.discount,
    })
    .eq("id", input.entryId);
  if (error) return { ok: false, message: error.message };

  // Propagate name corrections to the canonical show records.
  if (input.renameRecord) {
    if (entry.rider_id) {
      const parts = rider.split(/\s+/);
      await supabaseAdmin
        .from("show_riders")
        .update({ first_name: parts[0] ?? "", last_name: parts.slice(1).join(" "), full_name: rider })
        .eq("id", entry.rider_id);
    }
    if (entry.horse_id) {
      await supabaseAdmin.from("show_horses").update({ name: horse }).eq("id", entry.horse_id);
    }
  }

  revalidatePath(`/admin/events/${input.eventId}`);
  return { ok: true, data: undefined, message: "Participación actualizada." };
}

// Cancel / restore a participation (keeps the row, affects billing).
export async function setEntryStatusAction(
  entryId: string,
  eventId: string,
  status: "active" | "cancelled"
): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) return { ok: false, message: "Solo un administrador puede cambiar el estado." };

  const { error } = await supabaseAdmin.from("event_entries").update({ status }).eq("id", entryId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, data: undefined, message: status === "cancelled" ? "Cancelada." : "Restaurada." };
}
