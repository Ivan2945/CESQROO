"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import type { ActionResult } from "@/lib/types/actions";


function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function getIntOrNull(fd: FormData, key: string) {
  const v = getText(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Resolve club_id for operations that must be club-scoped.
// - club_admin: uses profile clubId
// - admin: must pass club_id in formData (hidden input), and we validate it matches the horse
async function resolveClubIdForHorse(
  supabase: any,
  profile: { role: string },
  clubId: string | null,
  horseId: string,
  formData?: FormData
) {
  if (profile.role !== "admin") {
    if (!clubId) throw new Error("No club_id available for this user.");
    return clubId;
  }

  const passed = formData ? (getText(formData, "club_id") || null) : null;
  if (!passed) throw new Error("club_id is required for admin operations.");

  const { data: horse, error } = await supabase
    .from("horses")
    .select("id, club_id")
    .eq("id", horseId)
    .single();

  if (error) throw new Error(error.message);
  if (!horse) throw new Error("Horse not found.");

  if (horse.club_id !== passed) {
    throw new Error("club_id does not match the horse's club.");
  }

  return passed;
}

export async function createHorseAction(formData: FormData) {
  const { supabase, profile, clubId } = await requireClubAdmin();

  // - admin: must provide club_id from form
  // - club_admin: use profile.club_id
  const club_id = profile.role === "admin" ? (getText(formData, "club_id") || null) : clubId;
  if (!club_id) throw new Error("club_id is required to create a horse.");

  const name = getText(formData, "name");
  const sex = getText(formData, "sex") || null;
  const birth_year = getIntOrNull(formData, "birth_year");
  const microchip = getText(formData, "microchip") || null;
  const notes = getText(formData, "notes") || null;

  if (!name) throw new Error("name is required.");

  const { error } = await supabase.from("horses").insert({
    club_id,
    name,
    sex,
    birth_year,
    microchip,
    notes,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/club/horses");
  redirect("/club/horses");
}

export async function updateHorseAction(horseId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id = await resolveClubIdForHorse(supabase, profile, clubId, horseId, formData);

  const name = getText(formData, "name");
  const sex = getText(formData, "sex") || null;
  const birth_year = getIntOrNull(formData, "birth_year");
  const microchip = getText(formData, "microchip") || null;
  const notes = getText(formData, "notes") || null;
  const status = getText(formData, "status") || "active";

  if (!name) throw new Error("name is required.");

  const { error } = await supabase
    .from("horses")
    .update({ name, sex, birth_year, microchip, notes, status })
    .eq("id", horseId)
    .eq("club_id", club_id);

  if (error) throw new Error(error.message);

  revalidatePath(`/club/horses/${horseId}`);
  revalidatePath("/club/horses");
}

export async function linkRiderToHorseAction(horseId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const riderId = getText(formData, "rider_id");
  const relationship = getText(formData, "relationship") || null;
  if (!riderId) throw new Error("rider_id is required");

  // Determine club_id for the link row:
  // - club_admin: use their clubId
  // - admin: infer from the horse (and validate against passed club_id if present)
  const club_id =
    profile.role === "admin"
      ? await resolveClubIdForHorse(supabase, profile, clubId, horseId, formData)
      : clubId;

  if (!club_id) throw new Error("club_id is required.");

  // Extra safety: ensure rider belongs to same club_id
  const { data: rider, error: riderErr } = await supabase
    .from("riders")
    .select("id, club_id")
    .eq("id", riderId)
    .single();

  if (riderErr) throw new Error(riderErr.message);
  if (!rider) throw new Error("Rider not found.");
  if (rider.club_id !== club_id) throw new Error("Rider and horse must belong to the same club.");

  const { error } = await supabase.from("rider_horses").insert({
    club_id,
    rider_id: riderId,
    horse_id: horseId,
    relationship,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/club/horses/${horseId}`);
  revalidatePath(`/club/riders/${riderId}`);
}

export async function unlinkRiderFromHorseAction(horseId: string, riderId: string, formData?: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id =
    profile.role === "admin"
      ? await resolveClubIdForHorse(supabase, profile, clubId, horseId, formData)
      : clubId;

  if (!club_id) throw new Error("club_id is required.");

  const { error } = await supabase
    .from("rider_horses")
    .delete()
    .eq("club_id", club_id)
    .eq("horse_id", horseId)
    .eq("rider_id", riderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/club/horses/${horseId}`);
  revalidatePath(`/club/riders/${riderId}`);
}

export async function createHorseActionState(
  _prev: ActionResult<void>,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await createHorseAction(formData);
    return { ok: true, data: undefined, message: "Created" };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to create horse" };
  }
}