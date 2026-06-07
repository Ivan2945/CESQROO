"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, type EventConfig } from "@/lib/events/config";
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

export async function saveEventConfigAction(
  eventId: string,
  payload: {
    name: string;
    isOpen: boolean;
    saturdayDate: string | null;
    sundayDate: string | null;
    config: EventConfig;
  }
): Promise<ActionResult<void>> {
  if (!(await isAdminUser())) {
    return { ok: false, message: "Solo un administrador puede editar la configuración." };
  }

  const name = (payload.name ?? "").trim();
  if (!name) return { ok: false, message: "El nombre del evento es obligatorio." };

  const config = normalizeConfig(payload.config);
  if (config.heights.length === 0) return { ok: false, message: "Agregue al menos una altura." };
  if (config.sections.length === 0) return { ok: false, message: "Agregue al menos una sección." };
  if (config.days.length === 0) return { ok: false, message: "Agregue al menos un día." };

  const { error } = await supabaseAdmin
    .from("events")
    .update({
      name,
      is_open: payload.isOpen,
      saturday_date: payload.saturdayDate || null,
      sunday_date: payload.sundayDate || null,
      config,
    })
    .eq("id", eventId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/events/${eventId}/config`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  return { ok: true, data: undefined, message: "Configuración guardada." };
}
