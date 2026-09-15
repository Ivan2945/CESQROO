"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TEMPLATE_CONFIG } from "@/lib/events/config";
import { slugify } from "@/lib/events/slug";

export async function createEventAction(formData: FormData) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/");

  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) throw new Error("El nombre del evento es obligatorio.");

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({ name, slug: slugify(name), is_open: true, config: TEMPLATE_CONFIG })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el evento.");

  revalidatePath("/admin/events");
  redirect(`/admin/events/${data.id}/config`);
}

export async function deleteEventAction(eventId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "No autorizado." };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, message: "Solo un administrador puede eliminar eventos." };
  if (!eventId) return { ok: false, message: "Falta el evento." };

  await supabaseAdmin.from("event_results").delete().eq("event_id", eventId);
  await supabaseAdmin.from("event_class_setup").delete().eq("event_id", eventId);
  await supabaseAdmin.from("event_entries").delete().eq("event_id", eventId);
  await supabaseAdmin.from("event_submissions").delete().eq("event_id", eventId);
  await supabaseAdmin.from("event_admins").delete().eq("event_id", eventId);
  const { error } = await supabaseAdmin.from("events").delete().eq("id", eventId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/events");
  return { ok: true };
}
