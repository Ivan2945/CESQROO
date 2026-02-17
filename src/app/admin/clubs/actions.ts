"use server";

import { supabaseServer } from "@/lib/supabase/server";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function createClubAction(formData: FormData) {
  const supabase = await supabaseServer();

  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) throw new Error("Club name is required.");
  if (!slug) slug = slugify(name);

  const { data, error } = await supabase
    .from("clubs")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
