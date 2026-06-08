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
