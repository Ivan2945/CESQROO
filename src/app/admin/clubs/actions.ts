"use server";

import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../actionTypes"; // <-- note: from src/app/admin/clubs to src/app/admin

type Club = { id: string; name: string; slug: string | null };

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createClubAction(
  _prev: ActionResult<Club>,
  formData: FormData
): Promise<ActionResult<Club>> {
  const { supabase, profile } = await requireClubAdmin();

  if (profile.role !== "admin") return { ok: false, message: "Access denied." };

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

  return { ok: true, message: "Club created.", data };
}
