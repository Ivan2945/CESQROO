"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import type { ActionResult } from "@/lib/types/actions";

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Keeps compatibility with your horse page import:
 * export updateHorseTestAction(...)
 */
export async function updateHorseTestAction(formData: FormData) {
  const { supabase, clubId, profile } = await requireClubAdmin();
  if (!clubId && profile.role !== "admin") redirect("/");

  const horse_id = getText(formData, "horse_id");
  const test_type = getText(formData, "test_type") || "AIE";
  const test_date = getText(formData, "test_date"); // YYYY-MM-DD
  const result = getText(formData, "result") || null;
  const reg_number = getText(formData, "reg_number") || null;

  if (!horse_id) throw new Error("horse_id is required");
  if (!test_date) throw new Error("test_date is required");

  // club_id is NOT NULL on horse_tests
  const { data: horse, error: horseErr } = await supabase
    .from("horses")
    .select("id, club_id")
    .eq("id", horse_id)
    .single();

  if (horseErr) throw new Error(horseErr.message);

  const effectiveClubId = horse?.club_id ?? clubId;
  if (!effectiveClubId) {
    throw new Error("Could not determine club_id for this horse.");
  }

  const expires_on = addDaysISO(test_date, 180);

  const { error: rpcErr } = await supabase.rpc("upsert_horse_test_rotate_archive", {
    p_club_id: effectiveClubId,
    p_horse_id: horse_id,
    p_test_type: test_type,
    p_test_date: test_date,
    p_expires_on: expires_on,
    p_result: result,
    p_reg_number: reg_number,
  });

  if (rpcErr) throw new Error(rpcErr.message);

  revalidatePath(`/club/horses/${horse_id}`);
  revalidatePath(`/club/tests`);
  redirect(`/club/horses/${horse_id}`);
}

/**
 * Missing export used by:
 *  - ./src/app/club/horses/[id]/page.tsx
 *
 * Your RPC is an upsert/rotate, so "create" can safely alias to update.
 */
export async function createHorseTestAction(formData: FormData) {
  return updateHorseTestAction(formData);
}

/**
 * Missing export used by:
 *  - ./src/app/admin/page.tsx
 */


export async function createHorseTestActionState(
  _prev: ActionResult<void>,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await createHorseTestAction(formData);
    return { ok: true, data: undefined, message: "Saved" };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to create horse test" };
  }
}

