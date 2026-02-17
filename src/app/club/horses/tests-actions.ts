"use server";

import { revalidatePath } from "next/cache";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function resolveClubIdForHorse(
  supabase: any,
  profile: { role: string },
  clubId: string | null,
  horseId: string,
  formData: FormData
) {
  // club_admin uses their profile clubId
  if (profile.role !== "admin") {
    if (!clubId) throw new Error("club_id is required.");
    return clubId;
  }

  // admin: accept club_id from form, but validate it matches horse.club_id
  const club_id = getText(formData, "club_id") || null;
  if (!club_id) throw new Error("club_id is required.");

  const { data: horse, error } = await supabase
    .from("horses")
    .select("id, club_id")
    .eq("id", horseId)
    .single();

  if (error) throw new Error(error.message);
  if (!horse) throw new Error("Horse not found.");

  if (horse.club_id !== club_id) {
    throw new Error("club_id does not match the horse's club.");
  }

  return club_id;
}

export async function createHorseTestAction(horseId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id = await resolveClubIdForHorse(supabase, profile, clubId, horseId, formData);

  const test_type = getText(formData, "test_type") || "Mandatory 6-month test";
  const reg_number = getText(formData, "reg_number") || null;
  const test_date = getText(formData, "test_date");
  if (!test_date) throw new Error("test_date is required");

  const { error } = await supabase.from("horse_tests").insert({
    club_id,
    horse_id: horseId,
    test_type,
    reg_number,
    test_date,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/club/horses/${horseId}`);
  revalidatePath("/club/tests");
}

export async function updateHorseTestAction(testId: string, horseId: string, formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  const club_id = await resolveClubIdForHorse(supabase, profile, clubId, horseId, formData);

  const test_type = getText(formData, "test_type") || "Mandatory 6-month test";
  const reg_number = getText(formData, "reg_number") || null;
  const test_date = getText(formData, "test_date");
  if (!test_date) throw new Error("test_date is required");

  const { error } = await supabase
    .from("horse_tests")
    .update({ test_type, reg_number, test_date })
    .eq("id", testId)
    .eq("club_id", club_id)
    .eq("horse_id", horseId);

  if (error) throw new Error(error.message);

  revalidatePath(`/club/horses/${horseId}`);
  revalidatePath("/club/tests");
}
