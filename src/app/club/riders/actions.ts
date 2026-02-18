// cesqroo-portal/src/app/club/riders/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Resolve club_id for operations that must be club-scoped.
// - club_admin: uses profile clubId
// - admin: must pass club_id in formData (hidden input), and we validate it matches the rider
async function resolveClubIdForRider(
  supabase: any,
  profile: { role: string },
  clubId: string | null,
  riderId: string,
  formData?: FormData
) {
  if (profile.role !== "admin") {
    if (!clubId) throw new Error("No club_id available for this user.");
    return clubId;
  }

  const passed = formData ? (getText(formData, "club_id") || null) : null;
  if (!passed) throw new Error("club_id is required for admin operations.");

  const { data: rider, error } = await supabase
    .from("riders")
    .select("id, club_id")
    .eq("id", riderId)
    .single();

  if (error) throw new Error(error.message);
  if (!rider) throw new Error("Rider not found.");

  if (rider.club_id !== passed) {
    throw new Error("club_id does not match the rider's club.");
  }

  return passed;
}

export async function createRiderAction(formData: FormData) {
  const { supabase, profile, clubId } = await requireClubAdmin();
  if (profile.role !== "admin" && profile.role !== "club_admin") redirect("/");

  // - admin: must provide club_id from form
  // - club_admin: uses profile clubId
  const club_id =
    profile.role === "admin" ? (getText(formData, "club_id") || null) : clubId;

  if (!club_id) throw new Error("club_id is required to create a rider.");

  const first_name = getText(formData, "first_name");
  const last_name = getText(formData, "last_name");
  const email = getText(formData, "email") || null;
  const phone = getText(formData, "phone") || null;
  const rider_number = getText(formData, "rider_number") || null;

  if (!first_name || !last_name) {
    throw new Error("first_name and last_name are required.");
  }

  const { error } = await supabase.from("riders").insert({
    club_id,
    first_name,
    last_name,
    email,
    phone,
    rider_number,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/club/riders");
  redirect("/club/riders");
}

export async function updateRiderAction(riderId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id = await resolveClubIdForRider(supabase, profile, clubId, riderId, formData);

  const first_name = getText(formData, "first_name");
  const last_name = getText(formData, "last_name");
  const email = getText(formData, "email") || null;
  const phone = getText(formData, "phone") || null;
  const rider_number = getText(formData, "rider_number") || null;
  const status = getText(formData, "status") || "active";

  if (!first_name || !last_name) {
    throw new Error("first_name and last_name are required.");
  }

  const { error } = await supabase
    .from("riders")
    .update({ first_name, last_name, email, phone, rider_number, status })
    .eq("id", riderId)
    .eq("club_id", club_id);

  if (error) throw new Error(error.message);

  revalidatePath(`/club/riders/${riderId}`);
  revalidatePath("/club/riders");
}

export async function linkHorseToRiderAction(riderId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const horseId = getText(formData, "horse_id");
  const relationship = getText(formData, "relationship") || null;
  if (!horseId) throw new Error("horse_id is required");

  const club_id = await resolveClubIdForRider(supabase, profile, clubId, riderId, formData);

  // Safety: ensure horse belongs to same club
  const { data: horse, error: horseErr } = await supabase
    .from("horses")
    .select("id, club_id")
    .eq("id", horseId)
    .single();

  if (horseErr) throw new Error(horseErr.message);
  if (!horse) throw new Error("Horse not found.");
  if (horse.club_id !== club_id) throw new Error("Horse and rider must belong to the same club.");

  const { error } = await supabase.from("rider_horses").insert({
    club_id,
    rider_id: riderId,
    horse_id: horseId,
    relationship,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/club/riders/${riderId}`);
  revalidatePath(`/club/horses/${horseId}`);
}

export async function unlinkHorseFromRiderAction(riderId: string, horseId: string, formData?: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id = await resolveClubIdForRider(supabase, profile, clubId, riderId, formData);

  const { error } = await supabase
    .from("rider_horses")
    .delete()
    .eq("club_id", club_id)
    .eq("rider_id", riderId)
    .eq("horse_id", horseId);

  if (error) throw new Error(error.message);

  revalidatePath(`/club/riders/${riderId}`);
  revalidatePath(`/club/horses/${horseId}`);
}

import type { ActionResult } from "@/app/admin/actionTypes";

// AdminQuickCreate wrapper (useActionState signature)
export async function createRiderActionState(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    await createRiderAction(formData); // calls your existing 1-arg action
    return { ok: true, message: "Rider created.", data: undefined };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to create rider." };
  }
}
