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
