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
