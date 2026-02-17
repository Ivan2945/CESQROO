"use server";

import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { revalidatePath } from "next/cache";

export type CreateClubState =
  | { ok: true; message: string; club: { id: string; name: string; slug: string | null } }
  | { ok: false; message: string };

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createClubAction(
  _prev: CreateClubState | null,
  formData: FormData
): Promise<CreateClubState> {
  const { supabase, profile } = await requireClubAdmin();

  if (profile.role !== "admin") {
    return { ok: false, message: "Access denied." };
  }

  const name = getText(formData, "name");
  const slug = getText(formData, "slug") || null;

  if (!name) return { ok: false, message: "Club name is required." };

  const { data, error } = await supabase
    .from("clubs")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/clubs");

  return { ok: true, message: "Club created.", club: data };
}

